// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db/client", () => ({ getPool: () => ({ query }) }));

import { listAuditEntries } from "./audit";

function row(id: string) {
  return {
    id,
    at: "now",
    actor_username: "alice",
    server_name: "Primary",
    org: "acme",
    action: "GET",
    resource_path: "/nodes",
    outcome: "success",
    status_code: 200,
  };
}

beforeEach(() => query.mockReset());

test("platform scope has no server/org filter", async () => {
  query.mockResolvedValueOnce({ rows: [row("3"), row("2")] });
  await listAuditEntries({ kind: "platform" });
  const [sql, params] = query.mock.calls[0];
  expect(sql).not.toMatch(/server_id/);
  expect(params).toEqual([51]); // just the LIMIT
});

test("server scope filters by server_id only", async () => {
  query.mockResolvedValueOnce({ rows: [] });
  await listAuditEntries({ kind: "server", serverId: "s1" });
  const [sql, params] = query.mock.calls[0];
  expect(sql).toMatch(/server_id = \$1/);
  expect(sql).not.toMatch(/org = /);
  expect(params).toEqual(["s1", 51]);
});

test("org scope filters by both server_id and org", async () => {
  query.mockResolvedValueOnce({ rows: [] });
  await listAuditEntries({ kind: "org", serverId: "s1", org: "acme" });
  const [, params] = query.mock.calls[0];
  expect(params).toEqual(["s1", "acme", 51]);
});

test("account/date filters and the cursor all compose", async () => {
  query.mockResolvedValueOnce({ rows: [] });
  await listAuditEntries(
    { kind: "platform" },
    { account: "alice", from: "2026-01-01", to: "2026-01-31" },
    "100",
  );
  const [sql, params] = query.mock.calls[0];
  expect(sql).toMatch(/actor_username = \$1/);
  expect(sql).toMatch(/at >= \$2/);
  expect(sql).toMatch(/at <= \$3/);
  expect(sql).toMatch(/id < \$4/);
  expect(params).toEqual(["alice", "2026-01-01", "2026-01-31", "100", 51]);
});

test("returns no next cursor when a full page or less comes back", async () => {
  query.mockResolvedValueOnce({ rows: [row("2"), row("1")] });
  const { entries, nextCursor } = await listAuditEntries({ kind: "platform" });
  expect(entries).toHaveLength(2);
  expect(nextCursor).toBeNull();
});

test("signals a next page by fetching one extra row and trimming it off", async () => {
  const rows = Array.from({ length: 51 }, (_, i) => row(String(51 - i)));
  query.mockResolvedValueOnce({ rows });
  const { entries, nextCursor } = await listAuditEntries({ kind: "platform" });
  expect(entries).toHaveLength(50);
  expect(nextCursor).toBe(entries[entries.length - 1].id);
});
