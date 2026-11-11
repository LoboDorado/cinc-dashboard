"use server";

import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { dataBags } from "@/lib/cinc/databags";
import { runAction, parseJsonObject, type ActionResult } from "@/lib/cinc/action";

export async function createBag(
  server: string,
  org: string,
  name: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      const ctx = await requireObjectAccess(accountId, server, org, "data_bags", "write");
      return dataBags.createBag(ctx, name);
    },
    { revalidate: `/servers/${server}/orgs/${org}/data_bags` },
  );
}

export async function deleteBag(
  server: string,
  org: string,
  bag: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      const ctx = await requireObjectAccess(accountId, server, org, "data_bags", "write");
      return dataBags.removeBag(ctx, bag);
    },
    { revalidate: `/servers/${server}/orgs/${org}/data_bags` },
  );
}

export async function saveItem(
  server: string,
  org: string,
  bag: string,
  id: string,
  json: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  const parsed = parseJsonObject(json);
  if (!parsed.ok) return { error: "invalid JSON" };
  return runAction(
    async () => {
      const ctx = await requireObjectAccess(accountId, server, org, "data_bags", "write");
      return dataBags.putItem(ctx, bag, id, parsed.value);
    },
    { revalidate: `/servers/${server}/orgs/${org}/data_bags/${bag}` },
  );
}

export async function createItem(
  server: string,
  org: string,
  bag: string,
  id: string,
  json: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  const parsed = parseJsonObject(json);
  if (!parsed.ok) return { error: "invalid JSON" };
  return runAction(
    async () => {
      const ctx = await requireObjectAccess(accountId, server, org, "data_bags", "write");
      return dataBags.createItem(ctx, bag, { ...parsed.value, id });
    },
    { revalidate: `/servers/${server}/orgs/${org}/data_bags/${bag}` },
  );
}

export async function deleteItem(
  server: string,
  org: string,
  bag: string,
  id: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      const ctx = await requireObjectAccess(accountId, server, org, "data_bags", "write");
      return dataBags.removeItem(ctx, bag, id);
    },
    { revalidate: `/servers/${server}/orgs/${org}/data_bags/${bag}` },
  );
}
