"use server";

import { currentAccountId } from "@/lib/guard";
import { requirePlatformAdmin } from "@/lib/admin/access";
import {
  createRegisteredServer,
  updateRegisteredServer,
  deleteRegisteredServer,
  type RegisteredServerInput,
} from "@/lib/admin/servers";
import { runAction, type ActionResult } from "@/lib/cinc/action";

// Form fields arrive as plain strings; an empty optional field means "none"
// (create) or "leave unchanged" (update) in lib/admin/servers.ts, neither of
// which is the same as storing a literal empty string.
function normalizeOptional(value: string | undefined): string | undefined {
  return value || undefined;
}

export async function createServerAction(input: RegisteredServerInput): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      await requirePlatformAdmin(accountId);
      await createRegisteredServer({ ...input, caCert: normalizeOptional(input.caCert) });
    },
    { revalidate: "/admin/servers" },
  );
}

export async function updateServerAction(
  id: string,
  input: Omit<RegisteredServerInput, "webuiKey"> & { webuiKey?: string },
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      await requirePlatformAdmin(accountId);
      await updateRegisteredServer(id, {
        ...input,
        caCert: normalizeOptional(input.caCert),
        webuiKey: normalizeOptional(input.webuiKey),
      });
    },
    { revalidate: "/admin/servers" },
  );
}

export async function deleteServerAction(id: string): Promise<ActionResult> {
  const accountId = await currentAccountId();
  return runAction(
    async () => {
      await requirePlatformAdmin(accountId);
      await deleteRegisteredServer(id);
    },
    { revalidate: "/admin/servers" },
  );
}
