// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

const { query, audit, config } = vi.hoisted(() => ({
  query: vi.fn(),
  audit: vi.fn(),
  config: { dashboardEncryptionKey: "k".repeat(32) },
}));
vi.mock("../db/client", () => ({ getPool: () => ({ query }) }));
vi.mock("../db/audit", () => ({ recordAudit: audit }));
vi.mock("../config", () => ({ getConfig: () => config }));

import {
  createRegisteredCollector,
  updateRegisteredCollector,
  deleteRegisteredCollector,
  listRegisteredCollectors,
} from "./collectors";

beforeEach(() => {
  query.mockReset();
  audit.mockReset();
});

test("listRegisteredCollectors aggregates linked server ids per collector", async () => {
  query.mockResolvedValueOnce({
    rows: [
      {
        id: "c1",
        name: "Collector A",
        base_url: "https://collector.example.com",
        ca_cert: null,
        tls_no_verify: false,
        server_ids: ["s1", "s2"],
        created_at: "now",
        updated_at: "now",
      },
    ],
  });
  const result = await listRegisteredCollectors();
  expect(result).toEqual([
    {
      id: "c1",
      name: "Collector A",
      baseUrl: "https://collector.example.com",
      hasCaCert: false,
      tlsNoVerify: false,
      linkedServerIds: ["s1", "s2"],
      createdAt: "now",
      updatedAt: "now",
    },
  ]);
});

test("createRegisteredCollector links every requested server and audits each one", async () => {
  query.mockImplementation((sql: string) => {
    if (sql.includes("INSERT INTO registered_collectors")) return { rows: [{ id: "c1" }] };
    if (sql.includes("SELECT server_id FROM registered_collector_servers")) return { rows: [] };
    return { rows: [] };
  });

  const id = await createRegisteredCollector(
    {
      name: "Collector A",
      baseUrl: "https://collector.example.com",
      bearerToken: "secret-token",
      tlsNoVerify: false,
      serverIds: ["s1", "s2"],
    },
    "alice",
  );

  expect(id).toBe("c1");
  const linkInserts = query.mock.calls.filter(([sql]) =>
    (sql as string).includes("INSERT INTO registered_collector_servers"),
  );
  expect(linkInserts).toHaveLength(2);
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: "collector_server_link.create", serverId: "s1" }),
  );
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: "collector_server_link.create", serverId: "s2" }),
  );
});

test("updateRegisteredCollector diffs the linkage: adds new links, removes dropped ones, leaves unchanged links alone", async () => {
  query.mockImplementation((sql: string) => {
    if (sql.includes("SELECT server_id FROM registered_collector_servers")) {
      return { rows: [{ server_id: "s1" }, { server_id: "s2" }] };
    }
    return { rows: [] };
  });

  await updateRegisteredCollector(
    "c1",
    {
      name: "Collector A",
      baseUrl: "https://collector.example.com",
      tlsNoVerify: false,
      serverIds: ["s2", "s3"], // s1 dropped, s2 kept, s3 added
    },
    "alice",
  );

  const inserts = query.mock.calls.filter(([sql]) =>
    (sql as string).includes("INSERT INTO registered_collector_servers"),
  );
  const deletes = query.mock.calls.filter(([sql]) =>
    (sql as string).includes("DELETE FROM registered_collector_servers"),
  );
  expect(inserts).toHaveLength(1);
  expect(inserts[0][1]).toEqual(["c1", "s3"]);
  expect(deletes).toHaveLength(1);
  expect(deletes[0][1]).toEqual(["c1", "s1"]);
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: "collector_server_link.create", serverId: "s3" }),
  );
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: "collector_server_link.revoke", serverId: "s1" }),
  );
});

test("updateRegisteredCollector without a new bearer token does not touch that column", async () => {
  query.mockImplementation((sql: string) => {
    if (sql.includes("SELECT server_id FROM registered_collector_servers")) return { rows: [] };
    return { rows: [] };
  });
  await updateRegisteredCollector(
    "c1",
    { name: "A", baseUrl: "https://x", tlsNoVerify: false, serverIds: [] },
    "alice",
  );
  const updateCall = query.mock.calls.find(([sql]) => (sql as string).startsWith("UPDATE registered_collectors"));
  expect(updateCall![0]).not.toMatch(/bearer_token_encrypted = /);
});

test("deleteRegisteredCollector deletes by id", async () => {
  query.mockResolvedValueOnce({ rows: [] });
  await deleteRegisteredCollector("c1");
  expect(query).toHaveBeenCalledWith("DELETE FROM registered_collectors WHERE id = $1", ["c1"]);
});
