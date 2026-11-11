// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { query, connect, client } = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  client: { query: vi.fn(), release: vi.fn() },
}));
vi.mock("../db/client", () => ({ getPool: () => ({ query, connect }) }));

import { completeSetup, isSetupNeeded, InvalidSetupTokenError, SetupAlreadyCompleteError } from "./setup";

beforeEach(() => {
  query.mockReset();
  connect.mockReset().mockResolvedValue(client);
  client.query.mockReset();
  client.release.mockReset();
});

afterEach(() => {
  vi.resetModules();
});

test("isSetupNeeded is true when no accounts exist", async () => {
  query.mockResolvedValueOnce({ rows: [{ n: 0 }] });
  expect(await isSetupNeeded()).toBe(true);
});

test("isSetupNeeded caches a false result so later calls skip the query", async () => {
  // Fresh module instance so the module-level cache starts unset.
  vi.resetModules();
  vi.doMock("../db/client", () => ({ getPool: () => ({ query, connect }) }));
  const { isSetupNeeded: freshIsSetupNeeded } = await import("./setup");

  query.mockResolvedValueOnce({ rows: [{ n: 1 }] });
  expect(await freshIsSetupNeeded()).toBe(false);
  expect(query).toHaveBeenCalledTimes(1);

  // A second call must not hit the database again.
  expect(await freshIsSetupNeeded()).toBe(false);
  expect(query).toHaveBeenCalledTimes(1);
});

function hashHex(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

test("completeSetup rejects when an account already exists", async () => {
  client.query.mockImplementation((sql: string) => {
    if (sql.includes("FROM dashboard_accounts")) return { rows: [{ n: 1 }] };
    return { rows: [] };
  });
  await expect(completeSetup("token", "alice", "password123", "Alice")).rejects.toThrow(
    SetupAlreadyCompleteError,
  );
  expect(client.query).toHaveBeenCalledWith("ROLLBACK");
});

test("completeSetup rejects an invalid token", async () => {
  client.query.mockImplementation((sql: string) => {
    if (sql.includes("FROM dashboard_accounts")) return { rows: [{ n: 0 }] };
    if (sql.includes("FROM setup_state")) return { rows: [{ token_hash: hashHex("the-real-token") }] };
    return { rows: [] };
  });
  await expect(completeSetup("wrong-token", "alice", "password123", "Alice")).rejects.toThrow(
    InvalidSetupTokenError,
  );
  expect(client.query).toHaveBeenCalledWith("ROLLBACK");
});

test("completeSetup rejects an already-consumed token (no unconsumed row found)", async () => {
  client.query.mockImplementation((sql: string) => {
    if (sql.includes("FROM dashboard_accounts")) return { rows: [{ n: 0 }] };
    if (sql.includes("FROM setup_state")) return { rows: [] }; // consumed_at IS NULL matched nothing
    return { rows: [] };
  });
  await expect(completeSetup("any-token", "alice", "password123", "Alice")).rejects.toThrow(
    InvalidSetupTokenError,
  );
});

test("completeSetup creates the account, grants platform_admin, and consumes the token", async () => {
  const token = "correct-token";
  const calls: string[] = [];
  client.query.mockImplementation((sql: string) => {
    calls.push(sql);
    if (sql.includes("FROM dashboard_accounts")) return { rows: [{ n: 0 }] };
    if (sql.includes("FROM setup_state")) return { rows: [{ token_hash: hashHex(token) }] };
    if (sql.includes("INSERT INTO dashboard_accounts")) {
      return { rows: [{ id: "acct-1", username: "alice" }] };
    }
    return { rows: [] };
  });

  const result = await completeSetup(token, "alice", "password123", "Alice");

  expect(result).toEqual({ id: "acct-1", username: "alice" });
  expect(calls.some((s) => s.includes("INSERT INTO role_grants"))).toBe(true);
  expect(calls.some((s) => s.includes("UPDATE setup_state SET consumed_at"))).toBe(true);
  expect(calls).toContain("COMMIT");
  expect(client.release).toHaveBeenCalled();
});
