"use server";

import { currentAccount } from "@/lib/guard";
import { requirePlatformAdmin } from "@/lib/admin/access";
import {
  createRegisteredCollector,
  updateRegisteredCollector,
  deleteRegisteredCollector,
  type RegisteredCollectorInput,
} from "@/lib/admin/collectors";
import { runAction, type ActionResult } from "@/lib/cinc/action";

function normalizeOptional(value: string | undefined): string | undefined {
  return value || undefined;
}

export async function createCollectorAction(input: RegisteredCollectorInput): Promise<ActionResult> {
  const account = await currentAccount();
  return runAction(
    async () => {
      await requirePlatformAdmin(account.id);
      await createRegisteredCollector(
        { ...input, caCert: normalizeOptional(input.caCert) },
        account.username,
      );
    },
    { revalidate: "/admin/collectors" },
  );
}

export async function updateCollectorAction(
  id: string,
  input: Omit<RegisteredCollectorInput, "bearerToken"> & { bearerToken?: string },
): Promise<ActionResult> {
  const account = await currentAccount();
  return runAction(
    async () => {
      await requirePlatformAdmin(account.id);
      await updateRegisteredCollector(
        id,
        {
          ...input,
          caCert: normalizeOptional(input.caCert),
          bearerToken: normalizeOptional(input.bearerToken),
        },
        account.username,
      );
    },
    { revalidate: "/admin/collectors" },
  );
}

export async function deleteCollectorAction(id: string): Promise<ActionResult> {
  const account = await currentAccount();
  return runAction(
    async () => {
      await requirePlatformAdmin(account.id);
      await deleteRegisteredCollector(id);
    },
    { revalidate: "/admin/collectors" },
  );
}
