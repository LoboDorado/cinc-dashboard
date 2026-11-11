"use server";

import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { makeResource } from "@/lib/cinc/resource";
import { runAction, parseJsonObject, type ActionResult } from "@/lib/cinc/action";

const environments = makeResource("environments");

export async function saveEnvironment(
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
      const ctx = await requireObjectAccess(accountId, server, org, "environments", "write");
      return environments.update(ctx, name, parsed.value);
    },
    { revalidate: `/servers/${server}/orgs/${org}/environments` },
  );
}

export async function createEnvironment(
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
      const ctx = await requireObjectAccess(accountId, server, org, "environments", "write");
      return environments.create(ctx, { ...parsed.value, name });
    },
    { revalidate: `/servers/${server}/orgs/${org}/environments` },
  );
}

export async function deleteEnvironment(
  server: string,
  org: string,
  name: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      const ctx = await requireObjectAccess(accountId, server, org, "environments", "write");
      return environments.remove(ctx, name);
    },
    { revalidate: `/servers/${server}/orgs/${org}/environments` },
  );
}
