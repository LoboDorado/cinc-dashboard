"use server";

import { currentAccountId } from "@/lib/guard";
import { createRoleGrant, revokeRoleGrant } from "@/lib/admin/grants";
import { getAccountByUsername } from "@/lib/admin/accounts";
import type { GrantScope, ObjectType, Role } from "@/lib/admin/policy";
import { runAction, type ActionResult } from "@/lib/cinc/action";

/**
 * Grants an org-scoped role to an account named by username. Which roles are
 * actually offered depends on the granter's own tier (lib/admin/policy.ts's
 * grantableRoles) -- an Org Admin here is capped to Org Object Manager/
 * Viewer, while a Platform Admin or this server's Server Admin can also hand
 * out Org Admin itself. Scope is entirely fixed to this one org;
 * lib/admin/grants.ts re-checks the delegation cap regardless of what the
 * client sent.
 */
export async function grantRoleToUsernameAction(
  server: string,
  org: string,
  targetUsername: string,
  role: Role,
  objectTypes: ObjectType[] = [],
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  const target = await getAccountByUsername(targetUsername);
  if (!target) return { error: `no dashboard account named "${targetUsername}"` };
  const scope: GrantScope = { kind: "org", serverId: server, org };
  return runAction(
    async () => {
      await createRoleGrant(accountId, target.id, role, scope, objectTypes);
    },
    { revalidate: `/servers/${server}/orgs/${org}/admin/roles` },
  );
}

export async function revokeGrantAction(server: string, org: string, grantId: string): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      await revokeRoleGrant(accountId, grantId);
    },
    { revalidate: `/servers/${server}/orgs/${org}/admin/roles` },
  );
}
