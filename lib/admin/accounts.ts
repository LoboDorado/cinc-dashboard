// Dashboard account management for admin surfaces: listing every account and
// creating new ones is Platform-Admin-only, but looking a single account up
// by username is also used by the delegated server/org role-grant surfaces
// (lib/admin/grants.ts's callers), which may only grant to an account they
// can name -- not browse the full roster. Self-service profile/password
// updates for an account's own login live in lib/dashboard/accounts.ts instead.
import "server-only";
import { getPool } from "../db/client";
import { hashPassword } from "../dashboard/password";

export type DashboardAccountSummary = {
  id: string;
  username: string;
  displayName: string;
  authSource: "local" | "ldap";
  createdAt: string;
};

type AccountRow = {
  id: string;
  username: string;
  display_name: string;
  auth_source: "local" | "ldap";
  created_at: string;
};

function mapAccountRow(r: AccountRow): DashboardAccountSummary {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    authSource: r.auth_source,
    createdAt: r.created_at,
  };
}

export async function listDashboardAccounts(): Promise<DashboardAccountSummary[]> {
  const { rows } = await getPool().query<AccountRow>(
    "SELECT id, username, display_name, auth_source, created_at FROM dashboard_accounts ORDER BY username",
  );
  return rows.map(mapAccountRow);
}

export async function getAccountByUsername(username: string): Promise<DashboardAccountSummary | null> {
  const { rows } = await getPool().query<AccountRow>(
    "SELECT id, username, display_name, auth_source, created_at FROM dashboard_accounts WHERE username = $1",
    [username],
  );
  return rows[0] ? mapAccountRow(rows[0]) : null;
}

export class AccountConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountConflictError";
  }
}

/** Postgres unique_violation. `username` and `ldap_dn` both have UNIQUE constraints (migration 0001). */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

async function insertAccount(
  username: string,
  displayName: string,
  authSource: "local" | "ldap",
  passwordHash: string | null,
  ldapDn: string | null,
): Promise<string> {
  try {
    const { rows } = await getPool().query<{ id: string }>(
      `INSERT INTO dashboard_accounts (username, display_name, auth_source, password_hash, ldap_dn)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [username, displayName, authSource, passwordHash, ldapDn],
    );
    return rows[0].id;
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AccountConflictError(
        `an account named "${username}"${ldapDn ? " or linked to that directory entry" : ""} already exists`,
      );
    }
    throw e;
  }
}

/** Creates a local account with an admin-chosen initial password. No role grant -- that's a separate step. */
export async function createLocalDashboardAccount(
  username: string,
  password: string,
  displayName: string,
): Promise<string> {
  const passwordHash = await hashPassword(password);
  return insertAccount(username, displayName, "local", passwordHash, null);
}

/**
 * Links a dashboard account to an existing LDAP directory entry by DN.
 * Pre-provisioning, not auto-creation on first bind: a successful bind
 * proves identity, but only against a DN already linked here, mirroring the
 * old "the submitted username must already exist" rule for Cinc users.
 */
export async function createLdapDashboardAccount(
  username: string,
  ldapDn: string,
  displayName: string,
): Promise<string> {
  return insertAccount(username, displayName, "ldap", null, ldapDn);
}
