import "server-only";
import type { AuthorizedActionContext } from "../admin/access";
import { cincRequest } from "./client";
import { cincPath } from "./path";

/**
 * A standard Chef org-scoped object family living at /<kind>:
 *   GET    /<kind>            → { name: url, ... }
 *   GET    /<kind>/<name>     → object
 *   POST   /<kind>            → create
 *   PUT    /<kind>/<name>     → replace
 *   DELETE /<kind>/<name>     → delete
 *
 * Every method takes an `AuthorizedActionContext` already scoped (by the
 * caller, via `requireObjectAccess`) to this `kind` and the right
 * read/write action — this module just builds the request, it doesn't decide
 * whether to make it.
 */
export function makeResource<T = Record<string, unknown>>(kind: string) {
  return {
    kind,
    list: (ctx: AuthorizedActionContext) =>
      cincRequest<Record<string, string>>(ctx, {
        method: "GET",
        path: cincPath`/${kind}`,
      }),
    get: (ctx: AuthorizedActionContext, name: string) =>
      cincRequest<T>(ctx, { method: "GET", path: cincPath`/${kind}/${name}` }),
    create: (ctx: AuthorizedActionContext, body: T) =>
      cincRequest<unknown>(ctx, { method: "POST", path: cincPath`/${kind}`, body }),
    update: (ctx: AuthorizedActionContext, name: string, body: T) =>
      cincRequest<unknown>(ctx, {
        method: "PUT",
        path: cincPath`/${kind}/${name}`,
        body,
      }),
    remove: (ctx: AuthorizedActionContext, name: string) =>
      cincRequest<unknown>(ctx, {
        method: "DELETE",
        path: cincPath`/${kind}/${name}`,
      }),
  };
}

export type Resource<T = Record<string, unknown>> = ReturnType<
  typeof makeResource<T>
>;
