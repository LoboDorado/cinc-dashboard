// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db/client", () => ({ getPool: () => ({ query }) }));

import { canManageRoleGrants } from "./access";

function grantRow(role: string, serverId: string | null, org: string | null) {
  return { role, server_id: serverId, org, object_types: null };
}

beforeEach(() => query.mockReset());

test("a platform_admin can manage role grants at any server or org", async () => {
  query.mockResolvedValueOnce({ rows: [grantRow("platform_admin", null, null)] });
  await expect(canManageRoleGrants("acct-1", "s1")).resolves.toBe(true);
});

test("that server's own server_admin can manage its server-scope grants", async () => {
  query.mockResolvedValueOnce({ rows: [grantRow("server_admin", "s1", null)] });
  await expect(canManageRoleGrants("acct-1", "s1")).resolves.toBe(true);
});

test("a server_admin on a different server cannot manage this one", async () => {
  query.mockResolvedValueOnce({ rows: [grantRow("server_admin", "s2", null)] });
  await expect(canManageRoleGrants("acct-1", "s1")).resolves.toBe(false);
});

test("an org_admin cannot manage the server-wide surface (no org given)", async () => {
  query.mockResolvedValueOnce({ rows: [grantRow("org_admin", "s1", "acme")] });
  await expect(canManageRoleGrants("acct-1", "s1")).resolves.toBe(false);
});

test("that org's own org_admin can manage its org-scope grants", async () => {
  query.mockResolvedValueOnce({ rows: [grantRow("org_admin", "s1", "acme")] });
  await expect(canManageRoleGrants("acct-1", "s1", "acme")).resolves.toBe(true);
});

test("an org_admin for a different org cannot manage this one", async () => {
  query.mockResolvedValueOnce({ rows: [grantRow("org_admin", "s1", "acme")] });
  await expect(canManageRoleGrants("acct-1", "s1", "other-org")).resolves.toBe(false);
});

test("an object-manager or viewer grant can never manage role grants", async () => {
  query.mockResolvedValueOnce({ rows: [grantRow("server_object_manager", "s1", null)] });
  await expect(canManageRoleGrants("acct-1", "s1")).resolves.toBe(false);
});
