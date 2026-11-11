"use server";

import {
  InvalidSetupTokenError,
  SetupAlreadyCompleteError,
  completeSetup,
} from "@/lib/dashboard/setup";

export type SetupResult = { ok: true } | { error: string };

/**
 * A Server Action is a public endpoint with erased parameter types, so every
 * field is validated here rather than trusted -- see CLAUDE.md's Security
 * invariants. `completeSetup` itself re-checks (inside one transaction) that
 * no account exists yet and that the token is valid and unconsumed.
 */
export async function submitSetup(
  token: string,
  username: string,
  password: string,
  displayName: string,
): Promise<SetupResult> {
  if (!token.trim()) return { error: "Enter the setup token from the server log." };
  if (!username.trim()) return { error: "Username is required." };
  if (password.length < 12) return { error: "Password must be at least 12 characters." };

  try {
    await completeSetup(token.trim(), username.trim(), password, displayName.trim() || username.trim());
    return { ok: true };
  } catch (e) {
    if (e instanceof InvalidSetupTokenError) {
      return { error: "That token is invalid or has already been used." };
    }
    if (e instanceof SetupAlreadyCompleteError) {
      return { error: "Setup has already been completed. Go to /login instead." };
    }
    throw e;
  }
}
