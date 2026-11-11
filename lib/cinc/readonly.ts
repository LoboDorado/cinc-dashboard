import "server-only";
import type { AuthorizedActionContext } from "../admin/access";
import { cincRequest } from "./client";
import { cincPath } from "./path";

/**
 * A read-only org-scoped object family living at /<kind>. Browsing only —
 * no create/update/delete — used for cookbooks, policies, and clients.
 */
function readOnlyResource(kind: string) {
  return {
    list: (ctx: AuthorizedActionContext) =>
      cincRequest<Record<string, unknown>>(ctx, { method: "GET", path: cincPath`/${kind}` }),
    get: (ctx: AuthorizedActionContext, name: string) =>
      cincRequest<unknown>(ctx, { method: "GET", path: cincPath`/${kind}/${name}` }),
  };
}

export const cookbooks = readOnlyResource("cookbooks");
export const policies = readOnlyResource("policies");
export const clients = readOnlyResource("clients");
