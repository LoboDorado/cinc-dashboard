// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";

const req = vi.fn();
vi.mock("./client", () => ({ cincRequest: (...a: unknown[]) => req(...a) }));

import { cookbooks, clients } from "./readonly";
import { cincPath } from "./path";
import type { AuthorizedActionContext } from "../admin/access";

const ctx = { org: "acme" } as AuthorizedActionContext;

beforeEach(() => req.mockReset());

test("cookbooks.list hits GET /cookbooks", async () => {
  req.mockResolvedValueOnce({ nginx: {} });
  await cookbooks.list(ctx);
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "GET",
    path: cincPath`/cookbooks`,
  });
});

test("clients.get hits GET /clients/<name>", async () => {
  req.mockResolvedValueOnce({});
  await clients.get(ctx, "web01");
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "GET",
    path: cincPath`/clients/web01`,
  });
});
