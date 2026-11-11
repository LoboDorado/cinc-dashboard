// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/guard", () => ({ currentAccountId: async () => "acct-1" }));

const {
  requirePlatformAdmin,
  listReachableOrgs,
  createLocalDashboardAccount,
  createLdapDashboardAccount,
  createRoleGrant,
  revokeRoleGrant,
} = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  listReachableOrgs: vi.fn(),
  createLocalDashboardAccount: vi.fn(),
  createLdapDashboardAccount: vi.fn(),
  createRoleGrant: vi.fn(),
  revokeRoleGrant: vi.fn(),
}));
vi.mock("@/lib/admin/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/access")>()),
  requirePlatformAdmin,
  listReachableOrgs,
}));
vi.mock("@/lib/admin/accounts", () => ({
  createLocalDashboardAccount,
  createLdapDashboardAccount,
}));
vi.mock("@/lib/admin/grants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/grants")>()),
  createRoleGrant,
  revokeRoleGrant,
}));

import {
  createLocalAccountAction,
  createLdapAccountAction,
  grantRoleAction,
  revokeRoleGrantAction,
  listOrgsForServerAction,
} from "./actions";

beforeEach(() => {
  requirePlatformAdmin.mockReset().mockResolvedValue(undefined);
  listReachableOrgs.mockReset();
  createLocalDashboardAccount.mockReset();
  createLdapDashboardAccount.mockReset();
  createRoleGrant.mockReset();
  revokeRoleGrant.mockReset();
});

test("createLocalAccountAction checks platform-admin access, falling back to username for a blank display name", async () => {
  createLocalDashboardAccount.mockResolvedValueOnce("a1");
  await expect(createLocalAccountAction("alice", "s3cret-password", "")).resolves.toEqual({ ok: true });
  expect(requirePlatformAdmin).toHaveBeenCalledWith("acct-1");
  expect(createLocalDashboardAccount).toHaveBeenCalledWith("alice", "s3cret-password", "alice");
});

test("createLocalAccountAction is denied for a non-platform-admin account", async () => {
  const { AccessDeniedError } = await import("@/lib/admin/access");
  requirePlatformAdmin.mockRejectedValueOnce(new AccessDeniedError());
  await expect(createLocalAccountAction("alice", "s3cret-password", "Alice")).resolves.toEqual({
    error: "forbidden",
  });
  expect(createLocalDashboardAccount).not.toHaveBeenCalled();
});

test("createLdapAccountAction passes the DN through", async () => {
  createLdapDashboardAccount.mockResolvedValueOnce("a2");
  await createLdapAccountAction("bob", "uid=bob,dc=example,dc=com", "Bob");
  expect(createLdapDashboardAccount).toHaveBeenCalledWith("bob", "uid=bob,dc=example,dc=com", "Bob");
});

test("grantRoleAction delegates to createRoleGrant with the granter, target, role, scope, and object types", async () => {
  const scope = { kind: "server" as const, serverId: "s1" };
  await expect(
    grantRoleAction("target-1", { role: "server_object_manager", scope, objectTypes: ["nodes"] }),
  ).resolves.toEqual({ ok: true });
  expect(createRoleGrant).toHaveBeenCalledWith("acct-1", "target-1", "server_object_manager", scope, ["nodes"]);
});

test("grantRoleAction maps a delegation-cap denial to forbidden", async () => {
  const { DelegationDeniedError } = await import("@/lib/admin/grants");
  createRoleGrant.mockRejectedValueOnce(new DelegationDeniedError());
  const result = await grantRoleAction("target-1", {
    role: "platform_admin",
    scope: { kind: "platform" },
    objectTypes: [],
  });
  expect(result).toEqual({ error: "forbidden" });
});

test("revokeRoleGrantAction revokes by grant id on behalf of the signed-in account", async () => {
  await expect(revokeRoleGrantAction("target-1", "grant-1")).resolves.toEqual({ ok: true });
  expect(revokeRoleGrant).toHaveBeenCalledWith("acct-1", "grant-1");
});

test("listOrgsForServerAction returns just the org names reachable by the signed-in account", async () => {
  listReachableOrgs.mockResolvedValueOnce([{ name: "org-a" }, { name: "org-b" }]);
  await expect(listOrgsForServerAction("s1")).resolves.toEqual(["org-a", "org-b"]);
  expect(listReachableOrgs).toHaveBeenCalledWith("acct-1", "s1");
});
