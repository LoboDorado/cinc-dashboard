"use server";

import { currentAccountId } from "@/lib/guard";
import { updateDisplayName, changeOwnPassword, LdapAccountPasswordError } from "@/lib/dashboard/accounts";
import type { ActionResult } from "@/lib/cinc/action";

export type ProfileDetails = {
  display_name?: string;
};

/**
 * The only field this form may write. A Server Action is a public endpoint and
 * its parameter type is erased at runtime, so a caller can hand us any object it
 * likes — picking a known field rather than spreading the input keeps that
 * erasure from mattering.
 */
function pickDisplayName(details: ProfileDetails): string | undefined {
  const value = details?.display_name;
  return typeof value === "string" ? value : undefined;
}

/** Update the logged-in account's display name, shown in the header/menu. */
export async function saveProfile(details: ProfileDetails): Promise<ActionResult> {
  const accountId = await currentAccountId();
  const displayName = pickDisplayName(details);
  if (displayName === undefined) return { error: "invalid request" };

  await updateDisplayName(accountId, displayName);
  // Nothing else to invalidate: the header reads the account fresh from the
  // database on every request (currentAccount()), not from the session cookie.
  return { ok: true };
}

/** Change the logged-in account's own password (local accounts only). */
export async function changePassword(password: string): Promise<ActionResult> {
  const accountId = await currentAccountId();
  // Same reasoning as pickDisplayName: the `string` annotation is not a runtime
  // check, and `(5).length < 12` is false — a non-string would sail past it.
  if (typeof password !== "string" || password.length < 12) {
    return { error: "password must be at least 12 characters" };
  }
  try {
    await changeOwnPassword(accountId, password);
    return { ok: true };
  } catch (e) {
    if (e instanceof LdapAccountPasswordError) return { error: e.message };
    throw e;
  }
}
