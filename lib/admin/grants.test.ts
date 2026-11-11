// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { query, connect, client, audit, loadGrantsMock, getAccountByIdMock } = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  client: { query: vi.fn(), release: vi.fn() },
  audit: vi.fn(),
  loadGrantsMock: vi.fn(),
  getAccountByIdMock: vi.fn(),
}));
vi.mock("../db/client", () => ({ getPool: () => ({ query, connect }) }));
vi.mock("../db/audit", () => ({ recordAudit: audit }));
vi.mock("../dashboard/accounts", () => ({ getAccountById: getAccountByIdMock }));
vi.mock("./access", () => ({ loadGrants: loadGrantsMock }));

import { createRoleGrant, revokeRoleGrant, listRoleGrants, DelegationDeniedError } from "./grants";
import type { RoleGrant } from "./policy";

beforeEach(() => {
  query.mockReset();
  connect.mockReset().mockResolvedValue(client);
  client.query.mockReset();
  client.release.mockReset();
  audit.mockReset();
  loadGrantsMock.mockReset();
  getAccountByIdMock.mockReset().mockResolvedValue({ id: "granter-1", username: "alice" });
});

afterEach(() => vi.clearAllMocks());

test("createRoleGrant denies a role the granter can't delegate, and audits the denial", async () => {
  loadGrantsMock.mockResolvedValue([
    { role: "org_viewer", serverId: "s1", org: "acme", objectTypes: [] } satisfies RoleGrant,
  ]);
  await expect(
    createRoleGrant("granter-1", "target-1", "org_admin", { kind: "org", serverId: "s1", org: "acme" }),
  ).rejects.toThrow(DelegationDeniedError);
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: "role_grant.create", outcome: "denied" }),
  );
  expect(connect).not.toHaveBeenCalled();
});

test("createRoleGrant inserts the grant (and its object types) when delegation allows it", async () => {
  loadGrantsMock.mockResolvedValue([
    { role: "platform_admin", serverId: null, org: null, objectTypes: [] } satisfies RoleGrant,
  ]);
  client.query.mockImplementation((sql: string) => {
    if (sql.includes("INSERT INTO role_grants")) return { rows: [{ id: "grant-1" }] };
    return { rows: [] };
  });

  await createRoleGrant(
    "granter-1",
    "target-1",
    "server_object_manager",
    { kind: "server", serverId: "s1" },
    ["nodes", "roles"],
  );

  const calls = client.query.mock.calls.map((c) => c[0] as string);
  expect(calls).toContain("BEGIN");
  expect(calls.some((s) => s.includes("INSERT INTO role_grants"))).toBe(true);
  expect(calls.filter((s) => s.includes("INSERT INTO role_grant_object_types")).length).toBe(2);
  expect(calls).toContain("COMMIT");
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: "role_grant.create", outcome: "success" }),
  );
});

test("revokeRoleGrant is a no-op when the grant no longer exists", async () => {
  query.mockResolvedValueOnce({ rows: [] });
  await revokeRoleGrant("granter-1", "gone");
  expect(loadGrantsMock).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();
});

test("revokeRoleGrant denies revoking a grant the granter couldn't have made", async () => {
  query.mockResolvedValueOnce({ rows: [{ role: "org_admin", server_id: "s1", org: "acme" }] });
  loadGrantsMock.mockResolvedValue([
    { role: "org_object_manager", serverId: "s1", org: "acme", objectTypes: [] } satisfies RoleGrant,
  ]);
  await expect(revokeRoleGrant("granter-1", "grant-1")).rejects.toThrow(DelegationDeniedError);
});

test("revokeRoleGrant deletes the grant when delegation allows it", async () => {
  query.mockImplementation((sql: string) => {
    if (sql.startsWith("SELECT role")) {
      return { rows: [{ role: "org_object_manager", server_id: "s1", org: "acme" }] };
    }
    return { rows: [] };
  });
  loadGrantsMock.mockResolvedValue([
    { role: "org_admin", serverId: "s1", org: "acme", objectTypes: [] } satisfies RoleGrant,
  ]);
  await revokeRoleGrant("granter-1", "grant-1");
  expect(query).toHaveBeenCalledWith("DELETE FROM role_grants WHERE id = $1", ["grant-1"]);
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: "role_grant.revoke", outcome: "success" }),
  );
});

test("listRoleGrants scopes its query by platform/server/org", async () => {
  query.mockResolvedValue({ rows: [] });
  await listRoleGrants({ kind: "platform" });
  expect(query.mock.calls[0][0]).toContain("g.server_id IS NULL");

  await listRoleGrants({ kind: "server", serverId: "s1" });
  expect(query.mock.calls[1][1]).toEqual(["s1"]);

  await listRoleGrants({ kind: "org", serverId: "s1", org: "acme" });
  expect(query.mock.calls[2][1]).toEqual(["s1", "acme"]);
});
