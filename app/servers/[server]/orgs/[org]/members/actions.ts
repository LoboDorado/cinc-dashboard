"use server";

import { currentAccountId } from "@/lib/guard";
import { requireScopeAdmin } from "@/lib/admin/access";
import { members } from "@/lib/cinc/members";
import { runAction, parseJsonObject, type ActionResult } from "@/lib/cinc/action";

// Members/Groups management is admin-tier only (requireScopeAdmin), not a
// configurable Object Manager type -- groups are commonly used to build the
// underlying Cinc Server's own ACLs, so they're deliberately not delegable
// the same way nodes/roles/etc. are. See lib/admin/policy.ts.

export async function inviteUser(
  server: string,
  org: string,
  username: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      const ctx = await requireScopeAdmin(accountId, server, org);
      return members.invite(ctx, username);
    },
    { revalidate: `/servers/${server}/orgs/${org}/members` },
  );
}

export async function removeUser(
  server: string,
  org: string,
  username: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      const ctx = await requireScopeAdmin(accountId, server, org);
      return members.removeUser(ctx, username);
    },
    { revalidate: `/servers/${server}/orgs/${org}/members` },
  );
}

export async function saveGroup(
  server: string,
  org: string,
  group: string,
  json: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  const parsed = parseJsonObject(json);
  if (!parsed.ok) return { error: "invalid JSON" };
  return runAction(
    async () => {
      const ctx = await requireScopeAdmin(accountId, server, org);
      return members.updateGroup(ctx, group, parsed.value);
    },
    { revalidate: `/servers/${server}/orgs/${org}/members` },
  );
}

export async function deleteGroup(
  server: string,
  org: string,
  group: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      const ctx = await requireScopeAdmin(accountId, server, org);
      return members.deleteGroup(ctx, group);
    },
    { revalidate: `/servers/${server}/orgs/${org}/members` },
  );
}
