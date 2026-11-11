// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/guard", () => ({ currentAccountId: async () => "acct-1" }));

const { getAccountByUsername, createRoleGrant, revokeRoleGrant, listReachableOrgs } = vi.hoisted(() => ({
  getAccountByUsername: vi.fn(),
  createRoleGrant: vi.fn(),
  revokeRoleGrant: vi.fn(),
  listReachableOrgs: vi.fn(),
}));
vi.mock("@/lib/admin/accounts", () => ({ getAccountByUsername }));
vi.mock("@/lib/admin/grants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/grants")>()),
  createRoleGrant,
  revokeRoleGrant,
}));
vi.mock("@/lib/admin/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/access")>()),
  listReachableOrgs,
}));

import { grantRoleToUsernameAction, revokeGrantAction, listOrgsForServerAction } from "./actions";

beforeEach(() => {
  getAccountByUsername.mockReset();
  createRoleGrant.mockReset();
  revokeRoleGrant.mockReset();
  listReachableOrgs.mockReset();
});

test("grantRoleToUsernameAction resolves the username and grants on their behalf", async () => {
  getAccountByUsername.mockResolvedValueOnce({ id: "target-1", username: "bob" });
  const scope = { kind: "server" as const, serverId: "s1" };
  await expect(
    grantRoleToUsernameAction("s1", { target: "bob", role: "server_object_manager", scope, objectTypes: ["nodes"] }),
  ).resolves.toEqual({ ok: true });
  expect(createRoleGrant).toHaveBeenCalledWith("acct-1", "target-1", "server_object_manager", scope, ["nodes"]);
});

test("grantRoleToUsernameAction reports an unknown username without touching createRoleGrant", async () => {
  getAccountByUsername.mockResolvedValueOnce(null);
  const result = await grantRoleToUsernameAction("s1", {
    target: "nobody",
    role: "server_viewer",
    scope: { kind: "server", serverId: "s1" },
    objectTypes: [],
  });
  expect(result).toEqual({ error: 'no dashboard account named "nobody"' });
  expect(createRoleGrant).not.toHaveBeenCalled();
});

test("grantRoleToUsernameAction maps a delegation-cap denial to forbidden", async () => {
  getAccountByUsername.mockResolvedValueOnce({ id: "target-1", username: "bob" });
  const { DelegationDeniedError } = await import("@/lib/admin/grants");
  createRoleGrant.mockRejectedValueOnce(new DelegationDeniedError());
  const result = await grantRoleToUsernameAction("s1", {
    target: "bob",
    role: "server_admin",
    scope: { kind: "server", serverId: "s1" },
    objectTypes: [],
  });
  expect(result).toEqual({ error: "forbidden" });
});

test("revokeGrantAction revokes by grant id on behalf of the signed-in account", async () => {
  await expect(revokeGrantAction("s1", "grant-1")).resolves.toEqual({ ok: true });
  expect(revokeRoleGrant).toHaveBeenCalledWith("acct-1", "grant-1");
});

test("listOrgsForServerAction returns just the org names reachable by the signed-in account", async () => {
  listReachableOrgs.mockResolvedValueOnce([{ name: "org-a" }]);
  await expect(listOrgsForServerAction("s1")).resolves.toEqual(["org-a"]);
  expect(listReachableOrgs).toHaveBeenCalledWith("acct-1", "s1");
});
