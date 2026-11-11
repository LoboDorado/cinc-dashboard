#!/usr/bin/env node
// Emergency recovery for the dashboard's own accounts, run by someone with
// direct server/container access. Bypasses the role-grant/delegation chain
// entirely, so every use is logged to audit_log under its own distinct
// action (dashboard_account.break_glass_reset) rather than folded into
// normal account-management events.
//
// Uses the SAME env as the app: CINC_DASHBOARD_DATABASE_URL
//
//   node scripts/break-glass.mjs reset-password <username>
//   node scripts/break-glass.mjs new-admin <username> [displayName]
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import pg from "pg";

const { Pool } = pg;
const scrypt = promisify(scryptCallback);

// Duplicated from lib/dashboard/password.ts rather than imported: this is a
// plain .mjs script run directly by `node`, which can't resolve a .ts import
// without a loader. Keep the hash format (`scrypt$<saltHex>$<hashHex>`)
// identical so verifyPassword() there accepts what this script writes.
async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function generatePassword() {
  return randomBytes(18).toString("base64url");
}

async function recordAudit(client, action, details) {
  await client.query(
    `INSERT INTO audit_log (actor_username, action, outcome, resource_path)
     VALUES ($1, $2, 'success', $3)`,
    ["break-glass-cli", action, details],
  );
}

export const usage =
  "usage: CINC_DASHBOARD_DATABASE_URL=… node scripts/break-glass.mjs reset-password <username>\n" +
  "   or: CINC_DASHBOARD_DATABASE_URL=… node scripts/break-glass.mjs new-admin <username> [displayName]";

/**
 * Runs one break-glass recovery operation against `pool`. Returns an exit
 * code (0 success, 1 a handled failure like "no such account", 2 bad usage)
 * rather than calling process.exit itself, so tests can run it against a
 * mocked pool without killing the test process.
 */
export async function runBreakGlass(pool, mode, username, extra) {
  if (!username || (mode !== "reset-password" && mode !== "new-admin")) {
    console.error(usage);
    return 2;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const password = generatePassword();
    const passwordHash = await hashPassword(password);

    if (mode === "reset-password") {
      const { rowCount } = await client.query(
        `UPDATE dashboard_accounts SET password_hash = $1, auth_source = 'local', ldap_dn = NULL, updated_at = now()
         WHERE username = $2`,
        [passwordHash, username],
      );
      if (rowCount === 0) {
        console.error(`no account named "${username}" exists.`);
        await client.query("ROLLBACK");
        return 1;
      }
      await recordAudit(client, "dashboard_account.break_glass_reset", `reset password for ${username}`);
      await client.query("COMMIT");
      console.log(`password reset for "${username}". New password:\n\n  ${password}\n`);
      return 0;
    }

    const { rows } = await client.query(
      `INSERT INTO dashboard_accounts (username, display_name, auth_source, password_hash)
       VALUES ($1, $2, 'local', $3)
       ON CONFLICT (username) DO NOTHING
       RETURNING id`,
      [username, extra || username, passwordHash],
    );
    if (rows.length === 0) {
      console.error(`an account named "${username}" already exists. Use reset-password instead.`);
      await client.query("ROLLBACK");
      return 1;
    }
    await client.query(
      `INSERT INTO role_grants (dashboard_account_id, role, granted_by) VALUES ($1, 'platform_admin', $1)`,
      [rows[0].id],
    );
    await recordAudit(client, "dashboard_account.break_glass_reset", `created emergency platform_admin "${username}"`);
    await client.query("COMMIT");
    console.log(`created emergency Platform Admin "${username}". Password:\n\n  ${password}\n`);
    return 0;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function main(argv) {
  const connectionString = process.env.CINC_DASHBOARD_DATABASE_URL;
  if (!connectionString) {
    console.error(usage);
    return 2;
  }
  const pool = new Pool({ connectionString });
  try {
    return await runBreakGlass(pool, argv[0], argv[1], argv[2]);
  } finally {
    await pool.end();
  }
}

// Only run as a CLI, so tests can import runBreakGlass without side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)));
}
