// One-time startup bootstrap, run from instrumentation.ts: migrates an
// existing single-server env config into the server registry, and issues the
// first-run setup token. Guarded by a Postgres advisory lock so multiple
// replicas booting at once don't race each other or double-print a token.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getConfig } from "../config";
import { log } from "../log";
import { getPool } from "./client";
import { encrypt } from "./secretbox";

// Arbitrary, stable int identifying this lock among any others the app might
// later take (pg_try_advisory_lock's key is a shared, process-wide namespace).
const BOOTSTRAP_LOCK_KEY = 72179;

async function withAdvisoryLock(fn: () => Promise<void>): Promise<void> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [BOOTSTRAP_LOCK_KEY],
    );
    if (!rows[0].locked) return; // another replica is already bootstrapping
    try {
      await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [BOOTSTRAP_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

/** Runs every bootstrap step once at startup. Call from instrumentation.ts. */
export async function runStartupBootstrap(): Promise<void> {
  await withAdvisoryLock(async () => {
    await ensureDefaultServerRegistered();
    await ensureSetupToken();
  });
}

/**
 * Migrates today's single-server env config (CINC_SERVER_URL/CINC_WEBUI_KEY)
 * into the server registry, once, if no server has been registered yet.
 *
 * CINC_SERVER_URL/CINC_WEBUI_KEY are still required config today (lib/cinc/*
 * hasn't yet been refactored to take a per-server AuthorizedActionContext
 * instead of reading them globally -- that lands with the authorization
 * chokepoint work) -- once that refactor ships, these become truly optional,
 * and a fresh install can skip them entirely and register servers only
 * through the admin UI.
 */
export async function ensureDefaultServerRegistered(): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM registered_servers",
  );
  if (rows[0].n > 0) return;

  const { serverUrl, webuiKey, caCert, sslNoVerify, authActor } = getConfig();
  await pool.query(
    `INSERT INTO registered_servers
       (name, base_url, ca_cert, webui_key_encrypted, impersonation_username, tls_no_verify)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      "default",
      serverUrl,
      caCert ?? null,
      encrypt(webuiKey),
      // Best available default for the shared impersonation identity: the
      // existing authenticate_user actor, or the conventional Chef/Cinc admin
      // username. An operator should review this in the admin UI once it
      // exists -- this is a migration convenience, not a considered choice.
      authActor ?? "pivotal",
      sslNoVerify,
    ],
  );
  log.info("dashboard.default_server_registered", { serverUrl });
}

/**
 * Issues a fresh one-time setup token if no dashboard account exists yet.
 * Regenerated on every restart while unconsumed, so a token copied from old
 * logs stops working the moment the process restarts -- no separate
 * expiry/TTL needed. The raw token is printed to stdout, not the structured
 * logger: it's meant for a human reading container logs, not for a log
 * aggregator to index.
 */
export async function ensureSetupToken(): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM dashboard_accounts",
  );
  if (rows[0].n > 0) return; // setup already completed

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await pool.query(
    `INSERT INTO setup_state (id, token_hash, created_at, consumed_at)
     VALUES (true, $1, now(), null)
     ON CONFLICT (id) DO UPDATE SET token_hash = $1, created_at = now(), consumed_at = null`,
    [tokenHash],
  );
  log.info("dashboard.setup_token_issued", {});
  console.log(
    "\ncinc-dashboard: no accounts exist yet. Visit /setup with this one-time token:\n\n" +
      `  ${token}\n\n` +
      "This token stops working on the next restart if it isn't used first.\n",
  );
}
