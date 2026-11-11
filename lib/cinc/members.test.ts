// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";

const req = vi.fn();
vi.mock("./client", () => ({ cincRequest: (...a: unknown[]) => req(...a) }));

import { members } from "./members";
import { cincPath } from "./path";
import type { AuthorizedActionContext } from "../admin/access";

const ctx = { org: "acme" } as AuthorizedActionContext;

beforeEach(() => req.mockReset());

test("listUsers hits GET /users", async () => {
  req.mockResolvedValueOnce([]);
  await members.listUsers(ctx);
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "GET",
    path: cincPath`/users`,
  });
});

test("invite POSTs the username to /association_requests", async () => {
  req.mockResolvedValueOnce({});
  await members.invite(ctx, "bob");
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "POST",
    path: cincPath`/association_requests`,
    body: { user: "bob" },
  });
});

test("removeUser DELETEs /users/<name>", async () => {
  req.mockResolvedValueOnce({});
  await members.removeUser(ctx, "bob");
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "DELETE",
    path: cincPath`/users/bob`,
  });
});

test("getGroup hits GET /groups/<name>", async () => {
  req.mockResolvedValueOnce({});
  await members.getGroup(ctx, "admins");
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "GET",
    path: cincPath`/groups/admins`,
  });
});

test("updateGroup PUTs the body to /groups/<name>", async () => {
  req.mockResolvedValueOnce({});
  await members.updateGroup(ctx, "admins", { users: ["bob"] });
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "PUT",
    path: cincPath`/groups/admins`,
    body: { users: ["bob"] },
  });
});
