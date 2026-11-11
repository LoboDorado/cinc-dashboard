// Dashboard account lookups and self-service profile updates. Account
// *creation* (local, via the setup token) lives in lib/dashboard/setup.ts;
// admin-driven account management (Phase 6+) will live in lib/admin/.
import "server-only";
import { getPool } from "../db/client";
import { hashPassword } from "./password";

export type DashboardAccount = {
  id: string;
  username: string;
  displayName: string;
  authSource: "local" | "ldap";
};

type AccountRow = {
  id: string;
  username: string;
  display_name: string;
  auth_source: "local" | "ldap";
};

export async function getAccountById(accountId: string): Promise<DashboardAccount | null> {
  const { rows } = await getPool().query<AccountRow>(
    "SELECT id, username, display_name, auth_source FROM dashboard_accounts WHERE id = $1",
    [accountId],
  );
  const row = rows[0];
  return row
    ? { id: row.id, username: row.username, displayName: row.display_name, authSource: row.auth_source }
    : null;
}

/** Updates the account's display name, shown in the header/menu. */
export async function updateDisplayName(accountId: string, displayName: string): Promise<void> {
  await getPool().query(
    "UPDATE dashboard_accounts SET display_name = $1, updated_at = now() WHERE id = $2",
    [displayName, accountId],
  );
}

export class LdapAccountPasswordError extends Error {
  constructor() {
    super("password is managed by your organization's directory");
    this.name = "LdapAccountPasswordError";
  }
}

/**
 * Changes a local account's own password. LDAP-linked accounts have no local
 * password to change -- the directory is authoritative -- so this guards
 * against that server-side, not just in the UI.
 */
export async function changeOwnPassword(accountId: string, newPassword: string): Promise<void> {
  const { rows } = await getPool().query<{ auth_source: string }>(
    "SELECT auth_source FROM dashboard_accounts WHERE id = $1",
    [accountId],
  );
  if (rows[0]?.auth_source !== "local") throw new LdapAccountPasswordError();
  const passwordHash = await hashPassword(newPassword);
  await getPool().query(
    "UPDATE dashboard_accounts SET password_hash = $1, updated_at = now() WHERE id = $2",
    [passwordHash, accountId],
  );
}
