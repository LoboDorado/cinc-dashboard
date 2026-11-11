"use server";

import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { deletePolicy, deletePolicyRevision } from "@/lib/cinc/policies";
import { runAction, type ActionResult } from "@/lib/cinc/action";

export async function deletePolicyRevisionAction(
  server: string,
  org: string,
  name: string,
  revision: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      const ctx = await requireObjectAccess(accountId, server, org, "policies", "write");
      return deletePolicyRevision(ctx, name, revision);
    },
    { revalidate: `/servers/${server}/orgs/${org}/policies` },
  );
}

export async function deletePolicyAction(
  server: string,
  org: string,
  name: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      const ctx = await requireObjectAccess(accountId, server, org, "policies", "write");
      return deletePolicy(ctx, name);
    },
    { revalidate: `/servers/${server}/orgs/${org}/policies` },
  );
}
