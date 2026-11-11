// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/guard", () => ({ currentAccountId: async () => "acct-1" }));

const { getAccountByUsername, createRoleGrant, revokeRoleGrant } = vi.hoisted(() => ({
  getAccountByUsername: vi.fn(),
  createRoleGrant: vi.fn(),
  revokeRoleGrant: vi.fn(),
}));
vi.mock("@/lib/admin/accounts", () => ({ getAccountByUsername }));
vi.mock("@/lib/admin/grants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/grants")>()),
  createRoleGrant,
  revokeRoleGrant,
}));

import { grantRoleToUsernameAction, revokeGrantAction } from "./actions";

beforeEach(() => {
  getAccountByUsername.mockReset();
  createRoleGrant.mockReset();
  revokeRoleGrant.mockReset();
});

test("grantRoleToUsernameAction resolves the username and grants at this fixed org scope", async () => {
  getAccountByUsername.mockResolvedValueOnce({ id: "target-1", username: "bob" });
  await expect(grantRoleToUsernameAction("s1", "acme", "bob", "org_object_manager", ["nodes"])).resolves.toEqual({
    ok: true,
  });
  expect(createRoleGrant).toHaveBeenCalledWith(
    "acct-1",
    "target-1",
    "org_object_manager",
    { kind: "org", serverId: "s1", org: "acme" },
    ["nodes"],
  );
});

test("grantRoleToUsernameAction reports an unknown username without touching createRoleGrant", async () => {
  getAccountByUsername.mockResolvedValueOnce(null);
  const result = await grantRoleToUsernameAction("s1", "acme", "nobody", "org_viewer");
  expect(result).toEqual({ error: 'no dashboard account named "nobody"' });
  expect(createRoleGrant).not.toHaveBeenCalled();
});

test("grantRoleToUsernameAction maps a delegation-cap denial to forbidden", async () => {
  getAccountByUsername.mockResolvedValueOnce({ id: "target-1", username: "bob" });
  const { DelegationDeniedError } = await import("@/lib/admin/grants");
  createRoleGrant.mockRejectedValueOnce(new DelegationDeniedError());
  const result = await grantRoleToUsernameAction("s1", "acme", "bob", "org_admin");
  expect(result).toEqual({ error: "forbidden" });
});

test("revokeGrantAction revokes by grant id on behalf of the signed-in account", async () => {
  await expect(revokeGrantAction("s1", "acme", "grant-1")).resolves.toEqual({ ok: true });
  expect(revokeRoleGrant).toHaveBeenCalledWith("acct-1", "grant-1");
});
