import "server-only";
import type { AuthorizedActionContext } from "../admin/access";
import { cincRequest } from "./client";
import { cincPath } from "./path";

/**
 * Org membership: users and groups.
 *
 * Users live at /users and are invited via /association_requests (the cinc
 * server's invitation flow). Groups live at /groups, where the list endpoint
 * returns a { name → url } map and each group is a JSON object edited in place.
 */
export const members = {
  listUsers: (ctx: AuthorizedActionContext) =>
    cincRequest<Array<{ user: { username: string } }>>(ctx, {
      method: "GET",
      path: cincPath`/users`,
    }),
  invite: (ctx: AuthorizedActionContext, username: string) =>
    cincRequest<unknown>(ctx, {
      method: "POST",
      path: cincPath`/association_requests`,
      body: { user: username },
    }),
  removeUser: (ctx: AuthorizedActionContext, username: string) =>
    cincRequest<unknown>(ctx, {
      method: "DELETE",
      path: cincPath`/users/${username}`,
    }),
  listGroups: (ctx: AuthorizedActionContext) =>
    cincRequest<Record<string, string>>(ctx, {
      method: "GET",
      path: cincPath`/groups`,
    }),
  getGroup: (ctx: AuthorizedActionContext, group: string) =>
    cincRequest<Record<string, unknown>>(ctx, {
      method: "GET",
      path: cincPath`/groups/${group}`,
    }),
  updateGroup: (ctx: AuthorizedActionContext, group: string, body: Record<string, unknown>) =>
    cincRequest<unknown>(ctx, {
      method: "PUT",
      path: cincPath`/groups/${group}`,
      body,
    }),
  deleteGroup: (ctx: AuthorizedActionContext, group: string) =>
    cincRequest<unknown>(ctx, {
      method: "DELETE",
      path: cincPath`/groups/${group}`,
    }),
};
