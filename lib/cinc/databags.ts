import "server-only";
import type { AuthorizedActionContext } from "../admin/access";
import { cincRequest } from "./client";
import { cincPath } from "./path";

/**
 * Data bags are a two-level org-scoped object family:
 *   GET    /data                  → { bag: url, ... }
 *   POST   /data                  → create a bag
 *   DELETE /data/<bag>            → delete a bag
 *   GET    /data/<bag>           → { item: url, ... }
 *   GET    /data/<bag>/<id>      → item object
 *   POST   /data/<bag>          → create an item
 *   PUT    /data/<bag>/<id>     → replace an item
 *   DELETE /data/<bag>/<id>     → delete an item
 */
export const dataBags = {
  list: (ctx: AuthorizedActionContext) =>
    cincRequest<Record<string, string>>(ctx, { method: "GET", path: cincPath`/data` }),
  createBag: (ctx: AuthorizedActionContext, name: string) =>
    cincRequest<unknown>(ctx, {
      method: "POST",
      path: cincPath`/data`,
      body: { name },
    }),
  removeBag: (ctx: AuthorizedActionContext, name: string) =>
    cincRequest<unknown>(ctx, {
      method: "DELETE",
      path: cincPath`/data/${name}`,
    }),
  listItems: (ctx: AuthorizedActionContext, bag: string) =>
    cincRequest<Record<string, string>>(ctx, {
      method: "GET",
      path: cincPath`/data/${bag}`,
    }),
  getItem: (ctx: AuthorizedActionContext, bag: string, id: string) =>
    cincRequest<unknown>(ctx, {
      method: "GET",
      path: cincPath`/data/${bag}/${id}`,
    }),
  putItem: (ctx: AuthorizedActionContext, bag: string, id: string, body: Record<string, unknown>) =>
    cincRequest<unknown>(ctx, {
      method: "PUT",
      path: cincPath`/data/${bag}/${id}`,
      body,
    }),
  createItem: (ctx: AuthorizedActionContext, bag: string, body: Record<string, unknown>) =>
    cincRequest<unknown>(ctx, {
      method: "POST",
      path: cincPath`/data/${bag}`,
      body,
    }),
  removeItem: (ctx: AuthorizedActionContext, bag: string, id: string) =>
    cincRequest<unknown>(ctx, {
      method: "DELETE",
      path: cincPath`/data/${bag}/${id}`,
    }),
};
