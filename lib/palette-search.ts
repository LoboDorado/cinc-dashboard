"use server";

import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess, AccessDeniedError } from "@/lib/admin/access";
import { makeResource } from "@/lib/cinc/resource";
import { policies } from "@/lib/cinc/readonly";
import { isCincError } from "@/lib/cinc/errors";
import { isUnsafePathError } from "@/lib/cinc/path";
import type { ObjectType } from "@/lib/admin/policy";

export type PaletteObject = { kind: string; label: string; name: string };

const KINDS: Array<{ kind: ObjectType; label: string }> = [
  { kind: "nodes", label: "Node" },
  { kind: "roles", label: "Role" },
  { kind: "environments", label: "Environment" },
];

/**
 * Names of the org's jump-to-able objects (nodes, roles, environments,
 * policies) for the ⌘K palette. List endpoints return name→url maps, so this is
 * names only. Each type is fetched in parallel and a type the account can't
 * read (either by role grant or by the server's own ACLs) is skipped rather
 * than failing the whole search.
 */
export async function searchOrgObjects(server: string, org: string): Promise<PaletteObject[]> {
  const accountId = await currentAccountId();
  const out: PaletteObject[] = [];

  const collect = async (kind: ObjectType, label: string, list: (ctx: Awaited<ReturnType<typeof requireObjectAccess>>) => Promise<Record<string, unknown>>) => {
    try {
      const ctx = await requireObjectAccess(accountId, server, org, kind, "read");
      const res = await list(ctx);
      for (const name of Object.keys(res)) out.push({ kind, label, name });
    } catch (e) {
      // No access to this type (role grant or the server's own ACL) or it's
      // unavailable — skip it.
      if (!(e instanceof AccessDeniedError) && !isCincError(e) && !isUnsafePathError(e)) throw e;
    }
  };

  await Promise.all([
    ...KINDS.map((k) => collect(k.kind, k.label, (ctx) => makeResource(k.kind).list(ctx))),
    collect("policies", "Policy", (ctx) => policies.list(ctx)),
  ]);

  return out;
}
