// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";

const req = vi.fn();
vi.mock("./client", () => ({ cincRequest: (...a: unknown[]) => req(...a) }));

import { makeResource } from "./resource";
import { cincPath } from "./path";
import type { AuthorizedActionContext } from "../admin/access";

const nodes = makeResource("nodes");

// A fake authorized context: the real one is only ever produced by
// lib/admin/access.ts's requireObjectAccess, but resource.ts just forwards it
// to cincRequest (mocked above) without inspecting its shape.
const ctx = { org: "acme", impersonationUsername: "pivotal" } as AuthorizedActionContext;

beforeEach(() => req.mockReset());

test("list hits GET /<kind>", async () => {
  req.mockResolvedValueOnce({ web01: "https://s/.../web01" });
  await nodes.list(ctx);
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "GET",
    path: cincPath`/nodes`,
  });
});

test("get hits GET /<kind>/<name>", async () => {
  req.mockResolvedValueOnce({});
  await nodes.get(ctx, "web01");
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "GET",
    path: cincPath`/nodes/web01`,
  });
});

test("update hits PUT /<kind>/<name> with body", async () => {
  req.mockResolvedValueOnce({});
  await nodes.update(ctx, "web01", { name: "web01" });
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "PUT",
    path: cincPath`/nodes/web01`,
    body: { name: "web01" },
  });
});

test("remove hits DELETE /<kind>/<name>", async () => {
  req.mockResolvedValueOnce({});
  await nodes.remove(ctx, "web01");
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "DELETE",
    path: cincPath`/nodes/web01`,
  });
});
