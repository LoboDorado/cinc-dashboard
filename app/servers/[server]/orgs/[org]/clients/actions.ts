"use server";

import { revalidatePath } from "next/cache";
import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess, AccessDeniedError } from "@/lib/admin/access";
import { createClient, deleteClient } from "@/lib/cinc/clients";
import { runAction, type ActionResult } from "@/lib/cinc/action";
import { isCincError } from "@/lib/cinc/errors";

export type CreateClientResult =
  | { ok: true; privateKey: string }
  | { error: string };

/**
 * Create a client and return its one-time private key. Unlike the generic
 * runAction flow this carries a payload (the key), so it maps errors itself.
 */
export async function createClientAction(
  server: string,
  org: string,
  name: string,
): Promise<CreateClientResult> {
  const accountId = await currentAccountId();
  try {
    const ctx = await requireObjectAccess(accountId, server, org, "clients", "write");
    const { privateKey } = await createClient(ctx, name);
    revalidatePath(`/servers/${server}/orgs/${org}/clients`, "layout");
    return { ok: true, privateKey };
  } catch (e) {
    if (e instanceof AccessDeniedError) return { error: "forbidden" };
    if (isCincError(e)) {
      if (e.forbidden) return { error: "forbidden" };
      if (e.conflict) return { error: "already exists" };
      return { error: `server error (${e.status})` };
    }
    throw e;
  }
}

export async function deleteClientAction(
  server: string,
  org: string,
  name: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      const ctx = await requireObjectAccess(accountId, server, org, "clients", "write");
      return deleteClient(ctx, name);
    },
    { revalidate: `/servers/${server}/orgs/${org}/clients` },
  );
}
