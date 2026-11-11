// Verifies dashboard account login credentials. Replaces lib/cinc/auth.ts
// (deleted): accounts are now dashboard-owned, not a given Cinc Server's own
// user objects, so there is no longer a server to ask.
import "server-only";
import { getConfig } from "../config";
import { getPool } from "../db/client";
import { ldapBind, LdapAuthError } from "../ldap/client";
import { log } from "../log";
import { verifyPassword } from "./password";

export type AuthResult = { id: string; username: string; displayName: string };

type AccountRow = {
  id: string;
  username: string;
  display_name: string;
  auth_source: "local" | "ldap";
  password_hash: string | null;
  ldap_dn: string | null;
};

async function findAccountByUsername(username: string): Promise<AccountRow | null> {
  const { rows } = await getPool().query<AccountRow>(
    `SELECT id, username, display_name, auth_source, password_hash, ldap_dn
     FROM dashboard_accounts WHERE username = $1`,
    [username],
  );
  return rows[0] ?? null;
}

function toResult(account: AccountRow): AuthResult {
  return { id: account.id, username: account.username, displayName: account.display_name };
}

/**
 * Verify credentials and return the identity to put in the session, or null
 * on any authentication failure. Branches per-account on `auth_source` (not a
 * single global AUTH_MODE): a local account's password is checked against its
 * own stored hash; an ldap account's password is proven by binding against
 * the configured directory, then matched by the bound DN -- mirroring the old
 * "LDAP never provisions users" rule, a successful bind for an account not
 * linked to that DN fails the login rather than silently re-linking it.
 */
export async function authenticate(username: string, password: string): Promise<AuthResult | null> {
  const account = await findAccountByUsername(username);
  if (!account) return null;

  if (account.auth_source === "local") {
    if (!account.password_hash) return null; // defensive; schema CHECK already enforces this
    const ok = await verifyPassword(password, account.password_hash);
    return ok ? toResult(account) : null;
  }

  const { authMode } = getConfig();
  if (authMode !== "ldap") {
    log.error("auth.ldap_account_but_auth_mode_local", { user: username });
    return null;
  }

  try {
    const { dn } = await ldapBind(username, password);
    if (dn !== account.ldap_dn) {
      log.error("auth.ldap_dn_mismatch", { user: username });
      return null; // fail closed — bound identity doesn't match the linked account
    }
    return toResult(account);
  } catch (e) {
    if (!(e instanceof LdapAuthError)) throw e;
    if (e.reason === "connection_error") {
      log.error("auth.ldap_unavailable", { user: username, reason: e.message });
    } else {
      log.warn("auth.ldap_failed", { user: username, reason: e.reason });
    }
    return null;
  }
}
