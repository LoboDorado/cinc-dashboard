"use server";

import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { makeResource } from "@/lib/cinc/resource";
import { runAction, parseJsonObject, type ActionResult } from "@/lib/cinc/action";

const nodes = makeResource("nodes");

export async function saveNode(
  server: string,
  org: string,
  name: string,
  json: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  const parsed = parseJsonObject(json);
  if (!parsed.ok) return { error: "invalid JSON" };
  return runAction(
    async () => {
      const ctx = await requireObjectAccess(accountId, server, org, "nodes", "write");
      return nodes.update(ctx, name, parsed.value);
    },
    { revalidate: `/servers/${server}/orgs/${org}/nodes` },
  );
}

export async function createNode(
  server: string,
  org: string,
  name: string,
  json: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  const parsed = parseJsonObject(json);
  if (!parsed.ok) return { error: "invalid JSON" };
  return runAction(
    async () => {
      const ctx = await requireObjectAccess(accountId, server, org, "nodes", "write");
      return nodes.create(ctx, { ...parsed.value, name });
    },
    { revalidate: `/servers/${server}/orgs/${org}/nodes` },
  );
}

export async function deleteNode(
  server: string,
  org: string,
  name: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      const ctx = await requireObjectAccess(accountId, server, org, "nodes", "write");
      return nodes.remove(ctx, name);
    },
    { revalidate: `/servers/${server}/orgs/${org}/nodes` },
  );
}
