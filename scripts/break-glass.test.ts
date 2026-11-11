// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { runBreakGlass, usage } from "./break-glass.mjs";

const client = { query: vi.fn(), release: vi.fn() };
const pool = { connect: vi.fn(async () => client) };

beforeEach(() => {
  client.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
  client.release.mockReset();
  pool.connect.mockClear();
});

afterEach(() => vi.restoreAllMocks());

test("rejects a missing username or an unknown mode without touching the database", async () => {
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await runBreakGlass(pool, "reset-password", undefined)).toBe(2);
  expect(await runBreakGlass(pool, "delete-everything", "alice")).toBe(2);
  expect(pool.connect).not.toHaveBeenCalled();
  expect(errSpy).toHaveBeenCalledWith(usage);
});

test("reset-password on an unknown account rolls back and reports failure", async () => {
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  client.query.mockImplementation(async (sql) => {
    if (sql.startsWith("UPDATE dashboard_accounts")) return { rowCount: 0 };
    return { rows: [] };
  });
  expect(await runBreakGlass(pool, "reset-password", "nobody")).toBe(1);
  expect(errSpy).toHaveBeenCalledWith('no account named "nobody" exists.');
  expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  expect(client.release).toHaveBeenCalledOnce();
});

test("reset-password success hashes a new password, audits, commits, and prints it once", async () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const queries: string[] = [];
  client.query.mockImplementation(async (sql) => {
    queries.push(sql);
    if (sql.startsWith("UPDATE dashboard_accounts")) return { rowCount: 1 };
    return { rows: [] };
  });
  expect(await runBreakGlass(pool, "reset-password", "alice")).toBe(0);

  const updateCall = client.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE dashboard_accounts"))!;
  const [, params] = updateCall;
  expect(params[1]).toBe("alice");
  expect(params[0]).toMatch(/^scrypt\$/);

  const auditCall = client.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO audit_log"))!;
  expect(auditCall[1]).toEqual(["break-glass-cli", "dashboard_account.break_glass_reset", "reset password for alice"]);

  expect(queries).toContain("COMMIT");
  expect(queries).not.toContain("ROLLBACK");
  expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/password reset for "alice"\. New password:/));
  expect(client.release).toHaveBeenCalledOnce();
});

test("new-admin on an existing username rolls back and reports a conflict", async () => {
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  client.query.mockImplementation(async (sql) => {
    if (sql.startsWith("INSERT INTO dashboard_accounts")) return { rows: [] }; // ON CONFLICT DO NOTHING
    return { rows: [] };
  });
  expect(await runBreakGlass(pool, "new-admin", "alice")).toBe(1);
  expect(errSpy).toHaveBeenCalledWith('an account named "alice" already exists. Use reset-password instead.');
  expect(client.query).toHaveBeenCalledWith("ROLLBACK");
});

test("new-admin success creates the account, grants platform_admin, audits, and prints the password", async () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  client.query.mockImplementation(async (sql) => {
    if (sql.startsWith("INSERT INTO dashboard_accounts")) return { rows: [{ id: "new-1" }] };
    return { rows: [] };
  });
  expect(await runBreakGlass(pool, "new-admin", "bob", "Bob Recovery")).toBe(0);

  const insertAccount = client.query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO dashboard_accounts"))!;
  expect(insertAccount[1][0]).toBe("bob");
  expect(insertAccount[1][1]).toBe("Bob Recovery");

  const grant = client.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO role_grants"))!;
  expect(grant[1]).toEqual(["new-1"]);

  expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/created emergency Platform Admin "bob"/));
});

test("new-admin falls back to the username as the display name when none is given", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  client.query.mockImplementation(async (sql) => {
    if (sql.startsWith("INSERT INTO dashboard_accounts")) return { rows: [{ id: "new-2" }] };
    return { rows: [] };
  });
  await runBreakGlass(pool, "new-admin", "carol");
  const insertAccount = client.query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO dashboard_accounts"))!;
  expect(insertAccount[1]).toEqual(["carol", "carol", expect.stringMatching(/^scrypt\$/)]);
});

test("a query failure rolls back, releases the client, and rethrows rather than being swallowed", async () => {
  client.query.mockImplementation(async (sql) => {
    if (sql === "BEGIN") return {};
    if (sql === "ROLLBACK") return {};
    throw new Error("connection reset");
  });
  await expect(runBreakGlass(pool, "reset-password", "alice")).rejects.toThrow("connection reset");
  expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  expect(client.release).toHaveBeenCalledOnce();
});
