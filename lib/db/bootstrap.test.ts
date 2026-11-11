// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { query, connect, client, getConfig, encrypt } = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  client: { query: vi.fn(), release: vi.fn() },
  getConfig: vi.fn(),
  encrypt: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
}));
vi.mock("./client", () => ({ getPool: () => ({ query, connect }) }));
vi.mock("../config", () => ({ getConfig }));
vi.mock("./secretbox", () => ({ encrypt }));

import { ensureDefaultServerRegistered, ensureSetupToken, runStartupBootstrap } from "./bootstrap";

beforeEach(() => {
  query.mockReset();
  connect.mockReset().mockResolvedValue(client);
  client.query.mockReset().mockResolvedValue({ rows: [{ locked: true }] });
  client.release.mockReset();
  getConfig.mockReset().mockReturnValue({
    serverUrl: "https://chef.example.com",
    webuiKey: "PEM",
    caCert: undefined,
    sslNoVerify: false,
    authActor: undefined,
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

test("ensureDefaultServerRegistered does nothing once a server is already registered", async () => {
  query.mockResolvedValueOnce({ rows: [{ n: 1 }] });
  await ensureDefaultServerRegistered();
  expect(query).toHaveBeenCalledTimes(1); // just the count, no INSERT
});

test("ensureDefaultServerRegistered registers one from env config, falling back to pivotal", async () => {
  query.mockResolvedValueOnce({ rows: [{ n: 0 }] }).mockResolvedValueOnce({ rows: [] });
  await ensureDefaultServerRegistered();
  const [sql, params] = query.mock.calls[1];
  expect(sql).toMatch(/INSERT INTO registered_servers/);
  expect(params).toEqual(["default", "https://chef.example.com", null, Buffer.from("enc:PEM"), "pivotal", false]);
});

test("ensureDefaultServerRegistered uses authActor as the impersonation username when set", async () => {
  getConfig.mockReturnValue({
    serverUrl: "https://chef.example.com",
    webuiKey: "PEM",
    caCert: "CA",
    sslNoVerify: true,
    authActor: "ops-bot",
  });
  query.mockResolvedValueOnce({ rows: [{ n: 0 }] }).mockResolvedValueOnce({ rows: [] });
  await ensureDefaultServerRegistered();
  const [, params] = query.mock.calls[1];
  expect(params).toEqual(["default", "https://chef.example.com", "CA", Buffer.from("enc:PEM"), "ops-bot", true]);
});

test("ensureSetupToken does nothing once a dashboard account exists", async () => {
  query.mockResolvedValueOnce({ rows: [{ n: 1 }] });
  await ensureSetupToken();
  expect(query).toHaveBeenCalledTimes(1); // just the count, no upsert
});

test("ensureSetupToken issues and prints a fresh token when no account exists yet", async () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  query.mockResolvedValueOnce({ rows: [{ n: 0 }] }).mockResolvedValueOnce({ rows: [] });
  await ensureSetupToken();
  expect(query.mock.calls[1][0]).toMatch(/INSERT INTO setup_state/);
  // log.info's own JSON line is a separate console.log call; find the raw,
  // human-readable one meant for someone reading container logs.
  expect(logSpy.mock.calls.map((c) => c[0])).toContainEqual(
    expect.stringMatching(/Visit \/setup with this one-time token/),
  );
});

test("ensureSetupToken regenerates a different token hash on each call, invalidating the last one", async () => {
  query.mockResolvedValueOnce({ rows: [{ n: 0 }] }).mockResolvedValueOnce({ rows: [] });
  await ensureSetupToken();
  const firstHash = query.mock.calls[1][1][0];

  query.mockResolvedValueOnce({ rows: [{ n: 0 }] }).mockResolvedValueOnce({ rows: [] });
  await ensureSetupToken();
  const secondHash = query.mock.calls[3][1][0];

  expect(firstHash).not.toBe(secondHash);
});

test("runStartupBootstrap takes the advisory lock, runs both steps, then releases it", async () => {
  query.mockResolvedValueOnce({ rows: [{ n: 1 }] }); // server already registered
  query.mockResolvedValueOnce({ rows: [{ n: 1 }] }); // account already exists
  await runStartupBootstrap();
  expect(client.query).toHaveBeenCalledWith("SELECT pg_try_advisory_lock($1) AS locked", [expect.any(Number)]);
  expect(client.query).toHaveBeenCalledWith("SELECT pg_advisory_unlock($1)", [expect.any(Number)]);
  expect(client.release).toHaveBeenCalledOnce();
});

test("runStartupBootstrap skips both steps when another replica already holds the lock", async () => {
  client.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
  await runStartupBootstrap();
  expect(query).not.toHaveBeenCalled();
  expect(client.release).toHaveBeenCalledOnce();
});
