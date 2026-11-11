// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";

const req = vi.fn();
vi.mock("./client", () => ({ cincRequest: (...a: unknown[]) => req(...a) }));

import { getAcl } from "./acl";
import { cincPath } from "./path";
import type { AuthorizedActionContext } from "../admin/access";

const ctx = { org: "acme" } as AuthorizedActionContext;

beforeEach(() => req.mockReset());

test("getAcl hits GET /<kind>/<name>/_acl", async () => {
  req.mockResolvedValueOnce({});
  await getAcl(ctx, "nodes", "web01");
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "GET",
    path: cincPath`/nodes/web01/_acl`,
  });
});
