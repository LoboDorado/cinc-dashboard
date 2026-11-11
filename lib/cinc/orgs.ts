import "server-only";
import type { AuthorizedActionContext } from "../admin/access";
import { cincRequest } from "./client";
import { cincPath } from "./path";

export type Org = { name: string; full_name?: string };

/**
 * Every organization on the server (GET /organizations) -- the server-wide,
 * admin-style listing (no per-user membership filtering), used to populate
 * the org picker for a Server/Platform-scope grant. An Org-scope grant never
 * calls this: it already knows its one org directly from the grant itself.
 */
export async function listAllOrgs(ctx: AuthorizedActionContext): Promise<Org[]> {
  const raw = await cincRequest<Record<string, string>>(ctx, {
    method: "GET",
    path: cincPath`/organizations`,
  });
  return Object.keys(raw).map((name) => ({ name }));
}
