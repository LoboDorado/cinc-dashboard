"use server";

import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { deleteCookbook, deleteCookbookVersion } from "@/lib/cinc/cookbooks";
import { runAction, type ActionResult } from "@/lib/cinc/action";

export async function deleteCookbookVersionAction(
  server: string,
  org: string,
  name: string,
  version: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      const ctx = await requireObjectAccess(accountId, server, org, "cookbooks", "write");
      return deleteCookbookVersion(ctx, name, version);
    },
    { revalidate: `/servers/${server}/orgs/${org}/cookbooks` },
  );
}

export async function deleteCookbookAction(
  server: string,
  org: string,
  name: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      const ctx = await requireObjectAccess(accountId, server, org, "cookbooks", "write");
      return deleteCookbook(ctx, name);
    },
    { revalidate: `/servers/${server}/orgs/${org}/cookbooks` },
  );
}
