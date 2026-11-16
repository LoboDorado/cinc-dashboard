// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveFleetAccess: vi.fn(),
  fetchFleetNodes: vi.fn(),
  getCollectorsForServer: vi.fn(),
  collectorRequest: vi.fn(),
}));
vi.mock("../cinc/fleet-aggregate", () => ({ resolveFleetAccess: mocks.resolveFleetAccess }));
vi.mock("../cinc/search", () => ({ fetchFleetNodes: mocks.fetchFleetNodes }));
vi.mock("../admin/collectors", () => ({ getCollectorsForServer: mocks.getCollectorsForServer }));
vi.mock("./client", () => ({ collectorRequest: mocks.collectorRequest }));

import { loadDefaultFleetComplianceOverview } from "./compliance-overview";
import type { AuthorizedActionContext } from "../admin/access";

function ctx(serverId: string, org: string): AuthorizedActionContext {
  return { serverId, org, accountId: "account-1", onBehalfOf: "alice" } as AuthorizedActionContext;
}

function resolvedScope(serverId: string, org: string, serverName = "Server One") {
  return { serverId, serverName, org, ctx: ctx(serverId, org) };
}

function fakeCollector(id: string, name = id) {
  return { id, name, baseUrl: `https://${id}.example.com`, bearerToken: "tok", tlsNoVerify: false };
}

function fleetNode(name: string) {
  return { name, ohaiTime: null, runList: [], policyName: null, policyGroup: null, chefVersion: null, environment: null, platform: null, platformVersion: null };
}

function rawReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ReportID: "r1",
    Org: "acme",
    NodeName: "web01",
    Environment: "prod",
    Status: "passed",
    ControlsPassed: 1,
    ControlsFailed: 0,
    ControlsSkipped: 0,
    Profiles: [],
    RawReport: {},
    StartTime: "2026-01-01T00:00:00Z",
    EndTime: "2026-01-01T00:01:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("no reachable contexts -> no_collector, nothing else called", async () => {
  mocks.resolveFleetAccess.mockResolvedValue({ contexts: [], failedScopes: [] });

  const result = await loadDefaultFleetComplianceOverview("account-1");
  expect(result).toEqual({ state: "no_collector" });
  expect(mocks.getCollectorsForServer).not.toHaveBeenCalled();
  expect(mocks.fetchFleetNodes).not.toHaveBeenCalled();
});

test("reachable contexts but zero linked collectors anywhere -> no_collector", async () => {
  mocks.resolveFleetAccess.mockResolvedValue({
    contexts: [resolvedScope("s1", "acme")],
    failedScopes: [],
  });
  mocks.getCollectorsForServer.mockResolvedValue([]);

  const result = await loadDefaultFleetComplianceOverview("account-1");
  expect(result).toEqual({ state: "no_collector" });
  expect(mocks.fetchFleetNodes).not.toHaveBeenCalled();
  expect(mocks.collectorRequest).not.toHaveBeenCalled();
});

test("includes a node that has compliance data but no CCR history -- the node universe comes from cinc-server-ng, not the collector's own node list", async () => {
  mocks.resolveFleetAccess.mockResolvedValue({
    contexts: [resolvedScope("s1", "acme")],
    failedScopes: [],
  });
  mocks.getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
  mocks.fetchFleetNodes.mockResolvedValue([fleetNode("compliance-only-node")]);
  mocks.collectorRequest.mockResolvedValue([rawReport({ NodeName: "compliance-only-node" })]);

  const result = await loadDefaultFleetComplianceOverview("account-1");
  expect(result.state).toBe("overview");
  if (result.state !== "overview") return;
  expect(result.results).toHaveLength(1);
  expect(result.results[0].nodeName).toBe("compliance-only-node");
});

test("caps the number of nodes queried and reports truncated + totalReachableNodes honestly", async () => {
  mocks.resolveFleetAccess.mockResolvedValue({
    contexts: [resolvedScope("s1", "acme")],
    failedScopes: [],
  });
  mocks.getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
  mocks.fetchFleetNodes.mockResolvedValue([
    fleetNode("web01"),
    fleetNode("web02"),
    fleetNode("web03"),
    fleetNode("web04"),
    fleetNode("web05"),
  ]);
  mocks.collectorRequest.mockResolvedValue([]);

  const result = await loadDefaultFleetComplianceOverview("account-1", 3);
  expect(result.state).toBe("overview");
  if (result.state !== "overview") return;
  expect(result.totalReachableNodes).toBe(5);
  expect(result.nodesConsidered).toBe(3);
  expect(result.truncated).toBe(true);
  expect(mocks.collectorRequest).toHaveBeenCalledTimes(3);
});

test("a node with an empty compliance response is omitted, not an error", async () => {
  mocks.resolveFleetAccess.mockResolvedValue({
    contexts: [resolvedScope("s1", "acme")],
    failedScopes: [],
  });
  mocks.getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
  mocks.fetchFleetNodes.mockResolvedValue([fleetNode("web01")]);
  mocks.collectorRequest.mockResolvedValue([]);

  const result = await loadDefaultFleetComplianceOverview("account-1");
  expect(result.state).toBe("overview");
  if (result.state !== "overview") return;
  expect(result.results).toEqual([]);
  expect(result.failedScopes).toEqual([]);
});

test("one node's compliance call throwing doesn't blank the rest of the results", async () => {
  mocks.resolveFleetAccess.mockResolvedValue({
    contexts: [resolvedScope("s1", "acme")],
    failedScopes: [],
  });
  mocks.getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
  mocks.fetchFleetNodes.mockResolvedValue([fleetNode("web01"), fleetNode("web02")]);
  mocks.collectorRequest
    .mockRejectedValueOnce(new Error("boom"))
    .mockResolvedValueOnce([rawReport({ NodeName: "web02" })]);

  const result = await loadDefaultFleetComplianceOverview("account-1");
  expect(result.state).toBe("overview");
  if (result.state !== "overview") return;
  expect(result.results).toHaveLength(1);
  expect(result.results[0].nodeName).toBe("web02");
  // The node-list fetch itself succeeded -- only one node's own compliance
  // call failed, which is omitted silently, not reported as a failed scope.
  expect(result.failedScopes).toEqual([]);
});

test("a whole scope's node-list fetch failing surfaces via failedScopes", async () => {
  mocks.resolveFleetAccess.mockResolvedValue({
    contexts: [resolvedScope("s1", "acme")],
    failedScopes: [],
  });
  mocks.getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
  mocks.fetchFleetNodes.mockRejectedValue(new Error("boom"));

  const result = await loadDefaultFleetComplianceOverview("account-1");
  expect(result.state).toBe("overview");
  if (result.state !== "overview") return;
  expect(result.results).toEqual([]);
  expect(result.failedScopes).toEqual([{ serverName: "Server One", org: "acme", reason: "unreachable" }]);
  expect(mocks.collectorRequest).not.toHaveBeenCalled();
});

test("a server with no linked collector contributes no entries but doesn't block other servers", async () => {
  mocks.resolveFleetAccess.mockResolvedValue({
    contexts: [resolvedScope("s1", "acme"), resolvedScope("s2", "acme", "Server Two")],
    failedScopes: [],
  });
  mocks.getCollectorsForServer.mockImplementation(async (id: string) =>
    id === "s1" ? [fakeCollector("c1")] : [],
  );
  mocks.fetchFleetNodes.mockImplementation(async (c: AuthorizedActionContext) =>
    c.serverId === "s1" ? [fleetNode("web01")] : [fleetNode("web99")],
  );
  mocks.collectorRequest.mockResolvedValue([rawReport({ NodeName: "web01" })]);

  const result = await loadDefaultFleetComplianceOverview("account-1");
  expect(result.state).toBe("overview");
  if (result.state !== "overview") return;
  expect(result.results).toHaveLength(1);
  expect(result.results[0].nodeName).toBe("web01");
  expect(result.failedScopes).toEqual([]);
});

test("upstream access failures (resolveFleetAccess's own failedScopes) pass through", async () => {
  mocks.resolveFleetAccess.mockResolvedValue({
    contexts: [resolvedScope("s1", "acme")],
    failedScopes: [{ serverName: "Server Zero", org: "*", reason: "unreachable" }],
  });
  mocks.getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
  mocks.fetchFleetNodes.mockResolvedValue([]);

  const result = await loadDefaultFleetComplianceOverview("account-1");
  expect(result.state).toBe("overview");
  if (result.state !== "overview") return;
  expect(result.failedScopes).toEqual([{ serverName: "Server Zero", org: "*", reason: "unreachable" }]);
});
