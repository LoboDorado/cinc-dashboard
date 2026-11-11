// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";
import { CincError } from "@/lib/cinc/errors";

vi.mock("@/lib/guard", () => ({ currentAccountId: async () => "acct-1" }));

const { requireScopeAdmin, invite, removeUser: removeUserFn, updateGroup, deleteGroupFn } =
  vi.hoisted(() => ({
    requireScopeAdmin: vi.fn(async () => "ctx"),
    invite: vi.fn(),
    removeUser: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroupFn: vi.fn(),
  }));
vi.mock("@/lib/admin/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/access")>()),
  requireScopeAdmin,
}));
vi.mock("@/lib/cinc/members", () => ({
  members: {
    invite,
    removeUser: removeUserFn,
    updateGroup,
    deleteGroup: deleteGroupFn,
  },
}));

import { inviteUser, removeUser, saveGroup, deleteGroup } from "./actions";

beforeEach(() => {
  requireScopeAdmin.mockClear();
  invite.mockReset();
  removeUserFn.mockReset();
  updateGroup.mockReset();
  deleteGroupFn.mockReset();
});

test("inviteUser invites by username, after checking admin-tier access", async () => {
  invite.mockResolvedValueOnce({});
  await expect(inviteUser("s1", "acme", "bob")).resolves.toEqual({ ok: true });
  expect(requireScopeAdmin).toHaveBeenCalledWith("acct-1", "s1", "acme");
  expect(invite).toHaveBeenCalledWith("ctx", "bob");
});

test("removeUser translates 403 into a forbidden result", async () => {
  removeUserFn.mockRejectedValueOnce(new CincError(403, "denied"));
  await expect(removeUser("s1", "acme", "bob")).resolves.toEqual({
    error: "forbidden",
  });
});

test("saveGroup rejects invalid JSON without calling the server", async () => {
  await expect(saveGroup("s1", "acme", "admins", "{not json")).resolves.toEqual({
    error: "invalid JSON",
  });
  expect(updateGroup).not.toHaveBeenCalled();
});

test("saveGroup saves the parsed object", async () => {
  updateGroup.mockResolvedValueOnce({});
  await expect(
    saveGroup("s1", "acme", "admins", '{"users":["bob"]}'),
  ).resolves.toEqual({ ok: true });
  expect(updateGroup).toHaveBeenCalledWith("ctx", "admins", { users: ["bob"] });
});

test("deleteGroup removes the group by name", async () => {
  deleteGroupFn.mockResolvedValueOnce({});
  await expect(deleteGroup("s1", "acme", "admins")).resolves.toEqual({ ok: true });
  expect(deleteGroupFn).toHaveBeenCalledWith("ctx", "admins");
});

test("deleteGroup translates 403 into a forbidden result", async () => {
  deleteGroupFn.mockRejectedValueOnce(new CincError(403, "denied"));
  await expect(deleteGroup("s1", "acme", "admins")).resolves.toEqual({
    error: "forbidden",
  });
});
