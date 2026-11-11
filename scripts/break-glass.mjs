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

const [mode, username, extra] = process.argv.slice(2);
const connectionString = process.env.CINC_DASHBOARD_DATABASE_URL;

function usage() {
  console.error(
    "usage: CINC_DASHBOARD_DATABASE_URL=… node scripts/break-glass.mjs reset-password <username>\n" +
      "   or: CINC_DASHBOARD_DATABASE_URL=… node scripts/break-glass.mjs new-admin <username> [displayName]",
  );
  process.exit(2);
}

if (!connectionString || !username || (mode !== "reset-password" && mode !== "new-admin")) {
  usage();
}

const pool = new Pool({ connectionString });

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

try {
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
        process.exit(1);
      }
      await recordAudit(client, "dashboard_account.break_glass_reset", `reset password for ${username}`);
      await client.query("COMMIT");
      console.log(`password reset for "${username}". New password:\n\n  ${password}\n`);
    } else {
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
        process.exit(1);
      }
      await client.query(
        `INSERT INTO role_grants (dashboard_account_id, role, granted_by) VALUES ($1, 'platform_admin', $1)`,
        [rows[0].id],
      );
      await recordAudit(client, "dashboard_account.break_glass_reset", `created emergency platform_admin "${username}"`);
      await client.query("COMMIT");
      console.log(`created emergency Platform Admin "${username}". Password:\n\n  ${password}\n`);
    }
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
