// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { CollectorError } from "./errors";

const mocks = vi.hoisted(() => ({
  listReachableScopes: vi.fn(),
  requireObjectAccessMany: vi.fn(),
  getCollectorsForServer: vi.fn(),
  collectorRequest: vi.fn(),
}));
vi.mock("../admin/access", () => ({
  listReachableScopes: mocks.listReachableScopes,
  requireObjectAccessMany: mocks.requireObjectAccessMany,
}));
vi.mock("../admin/collectors", () => ({ getCollectorsForServer: mocks.getCollectorsForServer }));
vi.mock("./client", () => ({ collectorRequest: mocks.collectorRequest }));

import { searchFleetCompliance } from "./compliance-search";
import type { AuthorizedActionContext } from "../admin/access";

function ctx(serverId: string, org: string): AuthorizedActionContext {
  return { serverId, org, accountId: "account-1", onBehalfOf: "alice" } as AuthorizedActionContext;
}

function fakeCollector(id: string, name = id) {
  return { id, name, baseUrl: `https://${id}.example.com`, bearerToken: "tok", tlsNoVerify: false };
}

function rawResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ReportID: "report-1",
    Org: "acme",
    NodeName: "web01",
    Environment: "prod",
    Status: "failed",
    ControlsPassed: 1,
    ControlsFailed: 1,
    ControlsSkipped: 0,
    Profiles: [],
    RawReport: {},
    StartTime: "2026-01-01T00:00:00Z",
    EndTime: "2026-01-01T00:01:00Z",
    Relevance: 1.5,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("no reachable contexts -> no_collector, nothing else called", async () => {
  mocks.listReachableScopes.mockResolvedValue({ scopes: [], unavailable: [] });
  mocks.requireObjectAccessMany.mockResolvedValue({ contexts: [], denied: [] });

  const result = await searchFleetCompliance("account-1", { q: "sshd" });
  expect(result).toEqual({ state: "no_collector" });
  expect(mocks.getCollectorsForServer).not.toHaveBeenCalled();
});

test("reachable contexts but zero linked collectors anywhere -> no_collector", async () => {
  mocks.listReachableScopes.mockResolvedValue({
    scopes: [{ serverId: "s1", serverName: "Server One", org: "acme" }],
    unavailable: [],
  });
  mocks.requireObjectAccessMany.mockResolvedValue({ contexts: [{ serverId: "s1", org: "acme", ctx: ctx("s1", "acme") }], denied: [] });
  mocks.getCollectorsForServer.mockResolvedValue([]);

  const result = await searchFleetCompliance("account-1", { q: "sshd" });
  expect(result).toEqual({ state: "no_collector" });
  expect(mocks.collectorRequest).not.toHaveBeenCalled();
});

test("a collector linked to two in-scope servers is queried exactly once", async () => {
  const shared = fakeCollector("shared-collector");
  mocks.listReachableScopes.mockResolvedValue({
    scopes: [
      { serverId: "s1", serverName: "Server One", org: "acme" },
      { serverId: "s2", serverName: "Server Two", org: "acme" },
    ],
    unavailable: [],
  });
  mocks.requireObjectAccessMany.mockResolvedValue({
    contexts: [
      { serverId: "s1", org: "acme", ctx: ctx("s1", "acme") },
      { serverId: "s2", org: "acme", ctx: ctx("s2", "acme") },
    ],
    denied: [],
  });
  mocks.getCollectorsForServer.mockImplementation(async (serverId: string) =>
    serverId === "s1" || serverId === "s2" ? [shared] : [],
  );
  mocks.collectorRequest.mockResolvedValue([rawResult()]);

  const result = await searchFleetCompliance("account-1", { q: "sshd" });
  expect(mocks.collectorRequest).toHaveBeenCalledTimes(1);
  expect(result.state).toBe("results");
  if (result.state === "results") {
    // Applied to every in-scope server that collector is linked to.
    expect(result.results.map((r) => r.serverId).sort()).toEqual(["s1", "s2"]);
  }
});

test("drops a result whose Org isn't in any scope the caller actually has", async () => {
  mocks.listReachableScopes.mockResolvedValue({
    scopes: [{ serverId: "s1", serverName: "Server One", org: "acme" }],
    unavailable: [],
  });
  mocks.requireObjectAccessMany.mockResolvedValue({ contexts: [{ serverId: "s1", org: "acme", ctx: ctx("s1", "acme") }], denied: [] });
  mocks.getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
  mocks.collectorRequest.mockResolvedValue([rawResult({ Org: "other-org" })]);

  const result = await searchFleetCompliance("account-1", { q: "sshd" });
  expect(result.state).toBe("results");
  if (result.state === "results") expect(result.results).toEqual([]);
});

test("one collector failing degrades only its own failedScopes entry, not the whole result", async () => {
  mocks.listReachableScopes.mockResolvedValue({
    scopes: [
      { serverId: "s1", serverName: "Server One", org: "acme" },
      { serverId: "s2", serverName: "Server Two", org: "beta" },
    ],
    unavailable: [],
  });
  mocks.requireObjectAccessMany.mockResolvedValue({
    contexts: [
      { serverId: "s1", org: "acme", ctx: ctx("s1", "acme") },
      { serverId: "s2", org: "beta", ctx: ctx("s2", "beta") },
    ],
    denied: [],
  });
  mocks.getCollectorsForServer.mockImplementation(async (serverId: string) =>
    serverId === "s1" ? [fakeCollector("c-bad")] : [fakeCollector("c-good")],
  );
  mocks.collectorRequest.mockImplementation(async (conn: { collectorId: string }) => {
    if (conn.collectorId === "c-bad") throw new CollectorError(500, { error: ["boom"] });
    return [rawResult({ Org: "beta", NodeName: "web02" })];
  });

  const result = await searchFleetCompliance("account-1", { q: "sshd" });
  expect(result.state).toBe("results");
  if (result.state === "results") {
    expect(result.failedScopes).toEqual([
      { serverId: "s1", serverName: "Server One", reason: "collector error (500)" },
    ]);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].nodeName).toBe("web02");
  }
});

test("status and limit are forwarded as query params, with the default limit when omitted", async () => {
  mocks.listReachableScopes.mockResolvedValue({
    scopes: [{ serverId: "s1", serverName: "Server One", org: "acme" }],
    unavailable: [],
  });
  mocks.requireObjectAccessMany.mockResolvedValue({ contexts: [{ serverId: "s1", org: "acme", ctx: ctx("s1", "acme") }], denied: [] });
  mocks.getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
  mocks.collectorRequest.mockResolvedValue([]);

  await searchFleetCompliance("account-1", { q: "sshd", status: "failed" });
  expect(mocks.collectorRequest).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.objectContaining({ query: { q: "sshd", limit: 100, status: "failed" } }),
  );
});

test("auditAction passed to collectorRequest is collector_compliance.search", async () => {
  mocks.listReachableScopes.mockResolvedValue({
    scopes: [{ serverId: "s1", serverName: "Server One", org: "acme" }],
    unavailable: [],
  });
  mocks.requireObjectAccessMany.mockResolvedValue({ contexts: [{ serverId: "s1", org: "acme", ctx: ctx("s1", "acme") }], denied: [] });
  mocks.getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
  mocks.collectorRequest.mockResolvedValue([]);

  await searchFleetCompliance("account-1", { q: "sshd" });
  expect(mocks.collectorRequest).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.objectContaining({ auditAction: "collector_compliance.search" }),
  );
});

test("merges and sorts by relevance desc, then startTime desc as a tiebreak", async () => {
  mocks.listReachableScopes.mockResolvedValue({
    scopes: [{ serverId: "s1", serverName: "Server One", org: "acme" }],
    unavailable: [],
  });
  mocks.requireObjectAccessMany.mockResolvedValue({ contexts: [{ serverId: "s1", org: "acme", ctx: ctx("s1", "acme") }], denied: [] });
  mocks.getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
  mocks.collectorRequest.mockResolvedValue([
    rawResult({ ReportID: "low", Relevance: 0.5 }),
    rawResult({ ReportID: "high", Relevance: 2.0 }),
  ]);

  const result = await searchFleetCompliance("account-1", { q: "sshd" });
  expect(result.state).toBe("results");
  if (result.state === "results") {
    expect(result.results.map((r) => r.reportId)).toEqual(["high", "low"]);
  }
});
