import "server-only";
import type { AuthorizedActionContext } from "../admin/access";
import { cincRequest } from "./client";
import { cincPath } from "./path";

export type Acl = Record<string, { actors: string[]; groups: string[] }>;

/** Fetch an object's ACL (GET /<kind>/<name>/_acl). */
export function getAcl(ctx: AuthorizedActionContext, kind: string, name: string) {
  return cincRequest<Acl>(ctx, {
    method: "GET",
    path: cincPath`/${kind}/${name}/_acl`,
  });
}
