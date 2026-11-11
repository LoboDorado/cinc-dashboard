// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";

const req = vi.fn();
vi.mock("./client", () => ({ cincRequest: (...a: unknown[]) => req(...a) }));

import { parseFleetRow, searchTotal } from "./search";
import { cincPath } from "./path";
import type { AuthorizedActionContext } from "../admin/access";

const ctx = { org: "acme" } as AuthorizedActionContext;

beforeEach(() => req.mockReset());

test("searchTotal asks for zero rows and returns the total", async () => {
  req.mockResolvedValueOnce({ total: 42, start: 0, rows: [] });

  const total = await searchTotal(ctx, "node", "ohai_time:[* TO *]");

  expect(total).toBe(42);
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "POST",
    path: cincPath`/search/node`,
    query: { q: "ohai_time:[* TO *]", rows: 0, start: 0 },
    body: {},
  });
});

test("searchTotal treats a missing total as zero", async () => {
  req.mockResolvedValueOnce({ rows: [] });
  expect(await searchTotal(ctx, "node", "*:*")).toBe(0);
});

test("parseFleetRow reads environment and platform, tolerating gaps", () => {
  expect(
    parseFleetRow({
      name: "web01",
      ohai_time: 1_700_000_000,
      run_list: ["recipe[base]"],
      chef_environment: "production",
      platform: "ubuntu",
      platform_version: "24.04",
      chef_version: "19.1.3",
    }),
  ).toMatchObject({
    environment: "production",
    platform: "ubuntu",
    platformVersion: "24.04",
  });
  // A node that has never converged has no ohai data at all.
  expect(parseFleetRow({ name: "fresh" })).toMatchObject({
    environment: null,
    platform: null,
    platformVersion: null,
  });
});
