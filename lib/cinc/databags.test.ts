// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";

const req = vi.fn();
vi.mock("./client", () => ({ cincRequest: (...a: unknown[]) => req(...a) }));

import { dataBags } from "./databags";
import { cincPath } from "./path";
import type { AuthorizedActionContext } from "../admin/access";

const ctx = { org: "acme" } as AuthorizedActionContext;

beforeEach(() => req.mockReset());

test("list hits GET /data", async () => {
  req.mockResolvedValueOnce({});
  await dataBags.list(ctx);
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "GET",
    path: cincPath`/data`,
  });
});

test("createBag POSTs the name to /data", async () => {
  req.mockResolvedValueOnce({});
  await dataBags.createBag(ctx, "secrets");
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "POST",
    path: cincPath`/data`,
    body: { name: "secrets" },
  });
});

test("removeBag DELETEs /data/<bag>", async () => {
  req.mockResolvedValueOnce({});
  await dataBags.removeBag(ctx, "secrets");
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "DELETE",
    path: cincPath`/data/secrets`,
  });
});

test("getItem hits GET /data/<bag>/<id>", async () => {
  req.mockResolvedValueOnce({});
  await dataBags.getItem(ctx, "secrets", "db");
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "GET",
    path: cincPath`/data/secrets/db`,
  });
});

test("putItem PUTs the body to /data/<bag>/<id>", async () => {
  req.mockResolvedValueOnce({});
  await dataBags.putItem(ctx, "secrets", "db", { id: "db", pw: "x" });
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "PUT",
    path: cincPath`/data/secrets/db`,
    body: { id: "db", pw: "x" },
  });
});

test("createItem POSTs the body to /data/<bag>", async () => {
  req.mockResolvedValueOnce({});
  await dataBags.createItem(ctx, "secrets", { id: "db" });
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "POST",
    path: cincPath`/data/secrets`,
    body: { id: "db" },
  });
});

test("removeItem DELETEs /data/<bag>/<id>", async () => {
  req.mockResolvedValueOnce({});
  await dataBags.removeItem(ctx, "secrets", "db");
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "DELETE",
    path: cincPath`/data/secrets/db`,
  });
});
