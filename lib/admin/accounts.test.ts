// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db/client", () => ({ getPool: () => ({ query }) }));

import {
  listDashboardAccounts,
  createLocalDashboardAccount,
  createLdapDashboardAccount,
  AccountConflictError,
} from "./accounts";

beforeEach(() => query.mockReset());

test("listDashboardAccounts maps rows to camelCase", async () => {
  query.mockResolvedValueOnce({
    rows: [
      { id: "a1", username: "alice", display_name: "Alice", auth_source: "local", created_at: "now" },
    ],
  });
  expect(await listDashboardAccounts()).toEqual([
    { id: "a1", username: "alice", displayName: "Alice", authSource: "local", createdAt: "now" },
  ]);
});

test("createLocalDashboardAccount stores a hashed password, not the plaintext", async () => {
  query.mockResolvedValueOnce({ rows: [{ id: "a1" }] });
  const id = await createLocalDashboardAccount("alice", "s3cret-password", "Alice");
  expect(id).toBe("a1");
  const params = query.mock.calls[0][1] as unknown[];
  expect(params[0]).toBe("alice");
  expect(params[2]).toBe("local");
  expect(params[3]).not.toBe("s3cret-password");
  expect(String(params[3])).toMatch(/^scrypt\$/);
  expect(params[4]).toBeNull();
});

test("createLdapDashboardAccount links a DN with no password hash", async () => {
  query.mockResolvedValueOnce({ rows: [{ id: "a2" }] });
  await createLdapDashboardAccount("bob", "uid=bob,dc=example,dc=com", "Bob");
  const params = query.mock.calls[0][1] as unknown[];
  expect(params[2]).toBe("ldap");
  expect(params[3]).toBeNull();
  expect(params[4]).toBe("uid=bob,dc=example,dc=com");
});

test("a duplicate username/DN surfaces as a friendly conflict error", async () => {
  query.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: "23505" }));
  await expect(createLocalDashboardAccount("alice", "s3cret-password", "Alice")).rejects.toThrow(
    AccountConflictError,
  );
});

test("an unrelated database error is not swallowed as a conflict", async () => {
  query.mockRejectedValueOnce(new Error("connection reset"));
  await expect(createLocalDashboardAccount("alice", "s3cret-password", "Alice")).rejects.toThrow(
    "connection reset",
  );
});
