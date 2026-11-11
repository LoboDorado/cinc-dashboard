#!/usr/bin/env node
// Seeds the dashboard accounts the e2e suite logs in as, directly into
// Postgres -- there's no standing bootstrap admin (see /setup), and driving
// that one-time setup-token flow through a real browser for every e2e run
// just to get the first account would be slower and flakier than inserting
// the two rows this suite actually needs.
//
// Uses the SAME env as the app: CINC_DASHBOARD_DATABASE_URL
//
//   node e2e/fixtures/seed-accounts.mjs admin
//   node e2e/fixtures/seed-accounts.mjs viewer <serverId> <org>
//   node e2e/fixtures/seed-accounts.mjs server-id      # prints the id of the
//                                                       # one registered server
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const { Pool } = pg;
const scrypt = promisify(scryptCallback);

// Duplicated from lib/dashboard/password.ts (see scripts/break-glass.mjs for
// the same justification: a plain .mjs script can't import a .ts module).
async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export const ADMIN = { username: "e2e-admin", password: "e2e-admin-password-1" };
export const VIEWER = { username: "e2e-viewer", password: "e2e-viewer-password-1" };

const [mode, ...args] = process.argv.slice(2);
const connectionString = process.env.CINC_DASHBOARD_DATABASE_URL;
if (!connectionString) {
  console.error("usage: CINC_DASHBOARD_DATABASE_URL=… node e2e/fixtures/seed-accounts.mjs <admin|viewer|server-id>");
  process.exit(2);
}

const pool = new Pool({ connectionString });

async function createAccount(username, password) {
  const passwordHash = await hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO dashboard_accounts (username, display_name, auth_source, password_hash)
     VALUES ($1, $1, 'local', $2) RETURNING id`,
    [username, passwordHash],
  );
  return rows[0].id;
}

try {
  if (mode === "admin") {
    const id = await createAccount(ADMIN.username, ADMIN.password);
    await pool.query(
      `INSERT INTO role_grants (dashboard_account_id, role, granted_by) VALUES ($1, 'platform_admin', $1)`,
      [id],
    );
    console.error(`seeded platform_admin account "${ADMIN.username}"`);
  } else if (mode === "viewer") {
    const [serverId, org] = args;
    if (!serverId || !org) {
      console.error("usage: node e2e/fixtures/seed-accounts.mjs viewer <serverId> <org>");
      process.exit(2);
    }
    const id = await createAccount(VIEWER.username, VIEWER.password);
    await pool.query(
      `INSERT INTO role_grants (dashboard_account_id, role, server_id, org, granted_by)
       VALUES ($1, 'org_viewer', $2, $3, $1)`,
      [id, serverId, org],
    );
    console.error(`seeded org_viewer account "${VIEWER.username}" on ${org}`);
  } else if (mode === "server-id") {
    const { rows } = await pool.query("SELECT id FROM registered_servers ORDER BY created_at LIMIT 1");
    if (!rows[0]) {
      console.error("no registered server yet -- start the app once first");
      process.exit(1);
    }
    console.log(rows[0].id);
  } else {
    console.error("usage: node e2e/fixtures/seed-accounts.mjs <admin|viewer|server-id>");
    process.exit(2);
  }
} finally {
  await pool.end();
}
