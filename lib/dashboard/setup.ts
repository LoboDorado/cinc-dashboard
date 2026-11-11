// Consumes the first-run setup token (lib/db/bootstrap.ts's ensureSetupToken)
// and creates the first dashboard account, granted platform_admin.
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { getPool } from "../db/client";
import { hashPassword } from "./password";

export class InvalidSetupTokenError extends Error {
  constructor() {
    super("invalid or already-used setup token");
    this.name = "InvalidSetupTokenError";
  }
}

export class SetupAlreadyCompleteError extends Error {
  constructor() {
    super("a dashboard account already exists");
    this.name = "SetupAlreadyCompleteError";
  }
}

// Once any account exists, it never needs re-checking: dashboard_accounts
// going from non-empty back to empty isn't a real-world case worth paying a
// DB round trip on every request to guard against. This cache turns the
// steady-state cost of the proxy's setup check into zero queries.
let setupComplete = false;

/** Whether `/setup` should be reachable: true only while no account exists yet. */
export async function isSetupNeeded(): Promise<boolean> {
  if (setupComplete) return false;
  const { rows } = await getPool().query<{ n: number }>(
    "SELECT count(*)::int AS n FROM dashboard_accounts",
  );
  const needed = rows[0].n === 0;
  if (!needed) setupComplete = true;
  return needed;
}

/**
 * Verifies `token`, creates the first dashboard account granted
 * platform_admin, and marks the token consumed -- all in one transaction, so
 * a failure partway through never leaves the token consumed without an
 * account, or an account created without consuming the token. Consumption
 * (not secrecy of the URL) is what closes the setup window.
 */
export async function completeSetup(
  token: string,
  username: string,
  password: string,
  displayName: string,
): Promise<{ id: string; username: string }> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const { rows: accountRows } = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM dashboard_accounts",
    );
    if (accountRows[0].n > 0) throw new SetupAlreadyCompleteError();

    const { rows: setupRows } = await client.query<{ token_hash: string }>(
      "SELECT token_hash FROM setup_state WHERE id = true AND consumed_at IS NULL FOR UPDATE",
    );
    const providedHash = createHash("sha256").update(token).digest();
    const storedHash = setupRows[0] ? Buffer.from(setupRows[0].token_hash, "hex") : null;
    if (
      !storedHash ||
      storedHash.length !== providedHash.length ||
      !timingSafeEqual(storedHash, providedHash)
    ) {
      throw new InvalidSetupTokenError();
    }

    const passwordHash = await hashPassword(password);
    const { rows } = await client.query<{ id: string; username: string }>(
      `INSERT INTO dashboard_accounts (username, display_name, auth_source, password_hash)
       VALUES ($1, $2, 'local', $3)
       RETURNING id, username`,
      [username, displayName, passwordHash],
    );
    const account = rows[0];
    await client.query(
      `INSERT INTO role_grants (dashboard_account_id, role, granted_by)
       VALUES ($1, 'platform_admin', $1)`,
      [account.id],
    );
    await client.query("UPDATE setup_state SET consumed_at = now() WHERE id = true");

    await client.query("COMMIT");
    return account;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
