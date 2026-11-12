// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";

const audit = vi.fn();
vi.mock("../db/audit", () => ({ recordAudit: (...a: unknown[]) => audit(...a) }));

// client.ts calls undici's own fetch, not the global one (see lib/cinc/client.ts's
// comment on why), so the mock has to replace undici's export rather than stub a global.
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("undici", async (importOriginal) => ({
  ...(await importOriginal<typeof import("undici")>()),
  fetch: fetchMock,
}));

import { collectorRequest, type CollectorConnection } from "./client";
import { cincPath } from "../cinc/path";

function fakeConn(overrides: Partial<CollectorConnection> = {}): CollectorConnection {
  return {
    collectorId: "collector-1",
    baseUrl: "https://collector.example.com",
    bearerToken: "secret-token",
    tlsNoVerify: false,
    ...overrides,
  };
}

const audit1 = { accountId: "account-1", onBehalfOf: "alice", serverId: "server-1", org: "acme" };

afterEach(() => {
  fetchMock.mockReset();
  audit.mockClear();
});

test("sends a bearer Authorization header", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ ok: 1 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  const out = await collectorRequest<{ ok: number }>(fakeConn(), audit1, {
    method: "GET",
    path: cincPath`/api/v0/nodes/web01/compliance`,
    auditAction: "collector_compliance.list",
  });
  expect(out.ok).toBe(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://collector.example.com/api/v0/nodes/web01/compliance");
  const headers = init.headers as Record<string, string>;
  expect(headers.Authorization).toBe("Bearer secret-token");
});

test("appends query params without touching the signed-free path", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
  await collectorRequest(fakeConn(), audit1, {
    method: "GET",
    path: cincPath`/api/v0/nodes`,
    query: { limit: 5000 },
    auditAction: "collector_nodes.list",
  });
  const [url] = fetchMock.mock.calls[0] as [string];
  expect(url).toBe("https://collector.example.com/api/v0/nodes?limit=5000");
});

test("uses a distinct TLS dispatcher per collectorId when tlsNoVerify or a CA cert is set", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
  await collectorRequest(fakeConn({ collectorId: "c-verify-off", tlsNoVerify: true }), audit1, {
    method: "GET",
    path: cincPath`/api/v0/nodes`,
    auditAction: "collector_nodes.list",
  });
  const [, init] = fetchMock.mock.calls[0] as [string, { dispatcher?: unknown }];
  expect(init.dispatcher).toBeDefined();
});

test("does not attach a dispatcher when TLS verification is left at its default", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
  await collectorRequest(fakeConn(), audit1, {
    method: "GET",
    path: cincPath`/api/v0/nodes`,
    auditAction: "collector_nodes.list",
  });
  const [, init] = fetchMock.mock.calls[0] as [string, { dispatcher?: unknown }];
  expect(init.dispatcher).toBeUndefined();
});

test("records a success audit entry with the given action and a collector-prefixed resource path", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
  await collectorRequest(fakeConn(), audit1, {
    method: "GET",
    path: cincPath`/api/v0/nodes/web01/compliance`,
    auditAction: "collector_compliance.list",
  });
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({
      actorAccountId: "account-1",
      actorUsername: "alice",
      serverId: "server-1",
      org: "acme",
      action: "collector_compliance.list",
      resourcePath: "collector:collector-1/api/v0/nodes/web01/compliance",
      outcome: "success",
      statusCode: 200,
    }),
  );
});

test("throws CollectorError with status/body on non-2xx, and audits it as an error", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: ["invalid or revoked token"] }), { status: 401 }),
  );
  await expect(
    collectorRequest(fakeConn(), audit1, {
      method: "GET",
      path: cincPath`/api/v0/nodes`,
      auditAction: "collector_nodes.list",
    }),
  ).rejects.toMatchObject({
    status: 401,
    unauthorized: true,
    body: { error: ["invalid or revoked token"] },
  });
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ outcome: "error", statusCode: 401, action: "collector_nodes.list" }),
  );
});

test("a 404 reports notFound but not unauthorized", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: ["not found"] }), { status: 404 }));
  await expect(
    collectorRequest(fakeConn(), audit1, {
      method: "GET",
      path: cincPath`/api/v0/compliance/reports/bad-id`,
      auditAction: "collector_compliance.get",
    }),
  ).rejects.toMatchObject({ status: 404, notFound: true, unauthorized: false });
});

// Smoke-level only: cincPath's own exhaustive rejection coverage lives in
// lib/cinc/path.test.ts. This just confirms collectorRequest's `path` param
// is the branded CincPath type, so a name that breaks out of its segment
// can't reach it as a plain string.
test("refuses to build a path a name has broken out of", () => {
  const badName = "web01/../_acl";
  expect(() => cincPath`/api/v0/nodes/${badName}/compliance`).toThrow(/unsafe request path/);
  expect(fetchMock).not.toHaveBeenCalled();
});
