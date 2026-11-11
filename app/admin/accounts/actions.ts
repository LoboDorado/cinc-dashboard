"use server";

import { currentAccountId } from "@/lib/guard";
import { requirePlatformAdmin, listReachableOrgs } from "@/lib/admin/access";
import { createLocalDashboardAccount, createLdapDashboardAccount } from "@/lib/admin/accounts";
import { createRoleGrant, revokeRoleGrant } from "@/lib/admin/grants";
import type { GrantScope, ObjectType, Role } from "@/lib/admin/policy";
import { runAction, type ActionResult } from "@/lib/cinc/action";

export async function createLocalAccountAction(
  username: string,
  password: string,
  displayName: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      await requirePlatformAdmin(accountId);
      await createLocalDashboardAccount(username, password, displayName || username);
    },
    { revalidate: "/admin/accounts" },
  );
}

export async function createLdapAccountAction(
  username: string,
  ldapDn: string,
  displayName: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      await requirePlatformAdmin(accountId);
      await createLdapDashboardAccount(username, ldapDn, displayName || username);
    },
    { revalidate: "/admin/accounts" },
  );
}

/**
 * Creates a role grant for an account at any scope (platform/server/org) --
 * this surface is Platform-Admin-only, so the full delegation table in
 * lib/admin/policy.ts's grantableRoles always applies, not just the
 * platform-scope slice of it. lib/admin/grants.ts re-checks the delegation
 * cap itself against the real scope, so a stale/forged scope from the client
 * can't grant more than the signed-in account is actually allowed to.
 */
export async function grantRoleAction(
  targetAccountId: string,
  role: Role,
  scope: GrantScope,
  objectTypes: ObjectType[] = [],
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      await createRoleGrant(accountId, targetAccountId, role, scope, objectTypes);
    },
    { revalidate: `/admin/accounts/${targetAccountId}` },
  );
}

export async function revokeRoleGrantAction(
  targetAccountId: string,
  grantId: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      await revokeRoleGrant(accountId, grantId);
    },
    { revalidate: `/admin/accounts/${targetAccountId}` },
  );
}

/** Orgs the *signed-in* account can see on `serverId` -- populates the org picker's autocomplete when granting an org-scoped role. */
export async function listOrgsForServerAction(serverId: string): Promise<string[]> {
  const accountId = await currentAccountId();
  const orgs = await listReachableOrgs(accountId, serverId);
  return orgs.map((o) => o.name);
}

// Re-exported so the shared role-grant form (used here and later by the
// delegated server/org admin surfaces) has a single place to import the
// types it binds its scope/role/object-type pickers to.
export type { GrantScope, ObjectType, Role };
