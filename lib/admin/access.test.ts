// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

const { query, decrypt, recordAudit } = vi.hoisted(() => ({
  query: vi.fn(),
  decrypt: vi.fn((b: Buffer) => `decrypted:${b.toString()}`),
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../db/client", () => ({ getPool: () => ({ query }) }));
vi.mock("../db/secretbox", () => ({ decrypt }));
vi.mock("../db/audit", () => ({ recordAudit }));

import {
  canManageRoleGrants,
  listReachableScopes,
  requireObjectAccessMany,
  requireOrgAccessMany,
} from "./access";

function grantRow(role: string, serverId: string | null, org: string | null, objectTypes: string[] | null = null) {
  return { role, server_id: serverId, org, object_types: objectTypes };
}

function serverRow(id: string, name: string) {
  return {
    id,
    name,
    base_url: `https://${id}.example.com`,
    ca_cert: null,
    webui_key_encrypted: Buffer.from(`enc:${id}`),
    impersonation_username: "pivotal",
    tls_no_verify: false,
  };
}

beforeEach(() => {
  query.mockReset();
  decrypt.mockClear();
  recordAudit.mockClear();
});

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

// --- listReachableScopes ----------------------------------------------------

test("listReachableScopes merges org-scoped grants across servers with no network call", async () => {
  const grants = [grantRow("org_viewer", "s1", "acme"), grantRow("org_viewer", "s2", "widgets")];
  query.mockImplementation((sql: string) => {
    if (sql.includes("FROM registered_servers s")) {
      return Promise.resolve({
        rows: [
          { id: "s1", name: "Server One" },
          { id: "s2", name: "Server Two" },
        ],
      });
    }
    if (sql.includes("FROM role_grants g")) return Promise.resolve({ rows: grants });
    throw new Error(`unexpected query: ${sql}`);
  });

  const result = await listReachableScopes("acct-1");
  expect(result.unavailable).toEqual([]);
  expect(result.scopes).toEqual(
    expect.arrayContaining([
      { serverId: "s1", serverName: "Server One", org: "acme" },
      { serverId: "s2", serverName: "Server Two", org: "widgets" },
    ]),
  );
  expect(result.scopes).toHaveLength(2);
});

test("listReachableScopes degrades one unreachable server without losing the others' scopes", async () => {
  // s1: a broad (server-wide) grant -- listReachableOrgs takes the live-lookup
  // branch, which fails here because the server row has gone missing.
  // s2: an org-scoped grant -- answered straight from role_grants, no network call.
  const grants = [grantRow("server_admin", "s1", null), grantRow("org_viewer", "s2", "widgets")];
  query.mockImplementation((sql: string, params?: unknown[]) => {
    if (sql.includes("FROM registered_servers s")) {
      return Promise.resolve({
        rows: [
          { id: "s1", name: "Server One" },
          { id: "s2", name: "Server Two" },
        ],
      });
    }
    if (sql.includes("FROM role_grants g")) return Promise.resolve({ rows: grants });
    if (sql.includes("FROM registered_servers WHERE id = $1")) {
      expect(params).toEqual(["s1"]);
      return Promise.resolve({ rows: [] }); // s1 vanished
    }
    if (sql.includes("FROM dashboard_accounts")) {
      return Promise.resolve({ rows: [{ id: "acct-1", username: "tester" }] });
    }
    throw new Error(`unexpected query: ${sql}`);
  });

  const result = await listReachableScopes("acct-1");
  expect(result.scopes).toEqual([{ serverId: "s2", serverName: "Server Two", org: "widgets" }]);
  expect(result.unavailable).toEqual([{ serverId: "s1", serverName: "Server One", reason: "unreachable" }]);
  // The denial inside requireScopeContext still audits, same as any other
  // single-scope denial -- listReachableScopes only suppresses audits for its
  // OWN bulk filtering (requireObjectAccessMany/requireOrgAccessMany), not for
  // the single-scope calls it composes.
  expect(recordAudit).toHaveBeenCalledTimes(1);
});

// --- requireObjectAccessMany -------------------------------------------------

test("requireObjectAccessMany decrypts each distinct server's key exactly once across multiple orgs", async () => {
  const grants = [grantRow("org_viewer", "s1", "acme"), grantRow("org_viewer", "s1", "widgets")];
  query.mockImplementation((sql: string) => {
    if (sql.includes("FROM role_grants g")) return Promise.resolve({ rows: grants });
    if (sql.includes("FROM registered_servers WHERE id = ANY")) {
      return Promise.resolve({ rows: [serverRow("s1", "Server One")] });
    }
    if (sql.includes("FROM dashboard_accounts")) {
      return Promise.resolve({ rows: [{ id: "acct-1", username: "tester" }] });
    }
    throw new Error(`unexpected query: ${sql}`);
  });

  const result = await requireObjectAccessMany(
    "acct-1",
    [
      { serverId: "s1", org: "acme" },
      { serverId: "s1", org: "widgets" },
    ],
    "roles",
    "read",
  );

  expect(result.denied).toEqual([]);
  expect(result.contexts).toHaveLength(2);
  expect(decrypt).toHaveBeenCalledTimes(1);
  expect(result.contexts.every((c) => c.ctx.webuiKey === "decrypted:enc:s1")).toBe(true);
});

test("requireObjectAccessMany denies a pair outside the account's grants without auditing it", async () => {
  const grants = [grantRow("org_viewer", "s1", "acme")];
  query.mockImplementation((sql: string) => {
    if (sql.includes("FROM role_grants g")) return Promise.resolve({ rows: grants });
    if (sql.includes("FROM registered_servers WHERE id = ANY")) {
      return Promise.resolve({ rows: [serverRow("s1", "Server One")] });
    }
    if (sql.includes("FROM dashboard_accounts")) {
      return Promise.resolve({ rows: [{ id: "acct-1", username: "tester" }] });
    }
    throw new Error(`unexpected query: ${sql}`);
  });

  const result = await requireObjectAccessMany(
    "acct-1",
    [
      { serverId: "s1", org: "acme" },
      { serverId: "s1", org: "someone-elses-org" },
    ],
    "roles",
    "read",
  );

  expect(result.contexts).toHaveLength(1);
  expect(result.contexts[0]).toMatchObject({ serverId: "s1", org: "acme" });
  expect(result.denied).toEqual([{ serverId: "s1", org: "someone-elses-org" }]);
  expect(recordAudit).not.toHaveBeenCalled();
});

test("requireObjectAccessMany's write filtering differs from read filtering for an object-manager grant", async () => {
  const grants = [grantRow("org_object_manager", "s1", "acme", ["roles"])];
  query.mockImplementation((sql: string) => {
    if (sql.includes("FROM role_grants g")) return Promise.resolve({ rows: grants });
    if (sql.includes("FROM registered_servers WHERE id = ANY")) {
      return Promise.resolve({ rows: [serverRow("s1", "Server One")] });
    }
    if (sql.includes("FROM dashboard_accounts")) {
      return Promise.resolve({ rows: [{ id: "acct-1", username: "tester" }] });
    }
    throw new Error(`unexpected query: ${sql}`);
  });

  const pairs = [{ serverId: "s1", org: "acme" }];
  const readRoles = await requireObjectAccessMany("acct-1", pairs, "roles", "read");
  const writeRoles = await requireObjectAccessMany("acct-1", pairs, "roles", "write");
  const writeNodes = await requireObjectAccessMany("acct-1", pairs, "nodes", "write");
  const readNodes = await requireObjectAccessMany("acct-1", pairs, "nodes", "read");

  expect(readRoles.contexts).toHaveLength(1);
  expect(writeRoles.contexts).toHaveLength(1); // roles is in this grant's objectTypes
  expect(writeNodes.contexts).toHaveLength(0); // nodes is not
  expect(readNodes.contexts).toHaveLength(1); // read is unconditional once scope matches
});

// --- requireOrgAccessMany -----------------------------------------------------

test("requireOrgAccessMany allows a reachable org and denies an unreachable one", async () => {
  const grants = [grantRow("org_viewer", "s1", "acme")];
  query.mockImplementation((sql: string) => {
    if (sql.includes("FROM role_grants g")) return Promise.resolve({ rows: grants });
    if (sql.includes("FROM registered_servers WHERE id = ANY")) {
      return Promise.resolve({ rows: [serverRow("s1", "Server One")] });
    }
    if (sql.includes("FROM dashboard_accounts")) {
      return Promise.resolve({ rows: [{ id: "acct-1", username: "tester" }] });
    }
    throw new Error(`unexpected query: ${sql}`);
  });

  const result = await requireOrgAccessMany("acct-1", [
    { serverId: "s1", org: "acme" },
    { serverId: "s1", org: "other-org" },
  ]);

  expect(result.contexts.map((c) => c.org)).toEqual(["acme"]);
  expect(result.denied).toEqual([{ serverId: "s1", org: "other-org" }]);
  expect(recordAudit).not.toHaveBeenCalled();
});
