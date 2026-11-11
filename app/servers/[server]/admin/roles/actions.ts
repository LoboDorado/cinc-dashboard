"use server";

import { currentAccountId } from "@/lib/guard";
import { createRoleGrant, revokeRoleGrant } from "@/lib/admin/grants";
import { getAccountByUsername } from "@/lib/admin/accounts";
import { listReachableOrgs } from "@/lib/admin/access";
import type { GrantScope, ObjectType, Role } from "@/lib/admin/policy";
import { runAction, type ActionResult } from "@/lib/cinc/action";

/**
 * Grants a role scoped to this server (or an org on it) to an account named
 * by username -- this surface can't browse the full account roster, only
 * grant to an account whose username it's told. lib/admin/grants.ts
 * re-checks the delegation cap against the real scope regardless of what the
 * client sent.
 *
 * Takes `server` pre-bound (`.bind(null, server)`) rather than closing over
 * it in an inline arrow function at the call site: a Server Component can
 * only pass a Client Component a server action's own reference or a
 * `.bind()` of one, not a plain closure wrapping a call to it.
 */
export async function grantRoleToUsernameAction(
  server: string,
  input: { target: string; role: Role; scope: GrantScope; objectTypes: ObjectType[] },
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  const target = await getAccountByUsername(input.target);
  if (!target) return { error: `no dashboard account named "${input.target}"` };
  return runAction(
    async () => {
      await createRoleGrant(accountId, target.id, input.role, input.scope, input.objectTypes);
    },
    { revalidate: `/servers/${server}/admin/roles` },
  );
}

export async function revokeGrantAction(server: string, grantId: string): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      await revokeRoleGrant(accountId, grantId);
    },
    { revalidate: `/servers/${server}/admin/roles` },
  );
}

/** Orgs the *signed-in* account can see on `serverId` -- populates the org picker's autocomplete when granting an org-scoped role. */
export async function listOrgsForServerAction(serverId: string): Promise<string[]> {
  const accountId = await currentAccountId();
  const orgs = await listReachableOrgs(accountId, serverId);
  return orgs.map((o) => o.name);
}
