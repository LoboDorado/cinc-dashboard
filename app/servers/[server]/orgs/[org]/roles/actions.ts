"use server";

import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { makeResource } from "@/lib/cinc/resource";
import { runAction, parseJsonObject, type ActionResult } from "@/lib/cinc/action";
import { listPath, objectPath } from "@/lib/urls";

const roles = makeResource("roles");

export async function saveRole(
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
      const ctx = await requireObjectAccess(accountId, server, org, "roles", "write");
      return roles.update(ctx, name, parsed.value);
    },
    { revalidate: [listPath("roles"), objectPath(server, org, "roles", name)] },
  );
}

export async function createRole(
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
      const ctx = await requireObjectAccess(accountId, server, org, "roles", "write");
      return roles.create(ctx, { ...parsed.value, name });
    },
    { revalidate: listPath("roles") },
  );
}

export async function deleteRole(
  server: string,
  org: string,
  name: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      const ctx = await requireObjectAccess(accountId, server, org, "roles", "write");
      return roles.remove(ctx, name);
    },
    { revalidate: listPath("roles") },
  );
}
