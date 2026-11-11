import "server-only";
import { redirect } from "next/navigation";
import { getAccountById, type DashboardAccount } from "./dashboard/accounts";
import { requireAccountId, Unauthorized } from "./session";

/**
 * Return the logged-in dashboard account's id in a Server Component or
 * Server Action, redirecting to /login if the session is missing or invalid.
 */
export async function currentAccountId(): Promise<string> {
  try {
    return await requireAccountId();
  } catch (e) {
    if (e instanceof Unauthorized) redirect("/login");
    throw e;
  }
}

/**
 * Return the logged-in dashboard account's full record (id, username, display
 * name, auth source) in a Server Component, redirecting to /login if
 * unauthenticated or if the account has since been deleted. Looked up fresh
 * from the database every call -- the session cookie carries only the id.
 */
export async function currentAccount(): Promise<DashboardAccount> {
  const id = await currentAccountId();
  const account = await getAccountById(id);
  if (!account) redirect("/login");
  return account;
}
