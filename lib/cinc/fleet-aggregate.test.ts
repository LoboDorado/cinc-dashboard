// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listReachableScopes: vi.fn(),
  requireObjectAccessMany: vi.fn(),
  fetchFleetNodes: vi.fn(),
  fetchFleetCounts: vi.fn(),
  getClientLifecycle: vi.fn(),
}));
vi.mock("../admin/access", () => ({
  listReachableScopes: mocks.listReachableScopes,
  requireObjectAccessMany: mocks.requireObjectAccessMany,
}));
vi.mock("./search", () => ({ fetchFleetNodes: mocks.fetchFleetNodes }));
vi.mock("./fleet-counts", () => ({ fetchFleetCounts: mocks.fetchFleetCounts }));
vi.mock("./client-lifecycle", () => ({ getClientLifecycle: mocks.getClientLifecycle }));

import {
  resolveFleetAccess,
  loadAggregatedFleetSnapshot,
  fetchAggregatedFleetCounts,
} from "./fleet-aggregate";
import type { AuthorizedActionContext } from "../admin/access";
import type { FleetNode } from "./fleet";

const NOW = 1_700_000_000_000;
const EMPTY_LIFECYCLE = { latestMajor: null, latestVersion: null, eolMajors: [] };

function ctx(serverId: string, org: string): AuthorizedActionContext {
  return { serverId, org } as AuthorizedActionContext;
}

function fleetNode(over: Partial<FleetNode> = {}): FleetNode {
  return {
    name: "n",
    ohaiTime: NOW / 1000,
    runList: ["recipe[base]"],
    policyName: null,
    policyGroup: null,
    chefVersion: "19.0.0",
    environment: "production",
    platform: "ubuntu",
    platformVersion: "24.04",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClientLifecycle.mockResolvedValue(EMPTY_LIFECYCLE);
});

afterEach(() => vi.useRealTimers());

// --- resolveFleetAccess ------------------------------------------------------

test("resolveFleetAccess merges unavailable servers and denied pairs into failedScopes", async () => {
  mocks.listReachableScopes.mockResolvedValue({
    scopes: [
      { serverId: "s1", serverName: "Server One", org: "acme" },
      { serverId: "s1", serverName: "Server One", org: "widgets" },
    ],
    unavailable: [{ serverId: "s2", serverName: "Server Two", reason: "unreachable" }],
  });
  mocks.requireObjectAccessMany.mockResolvedValue({
    contexts: [{ serverId: "s1", org: "acme", ctx: ctx("s1", "acme") }],
    denied: [{ serverId: "s1", org: "widgets" }],
  });

  const result = await resolveFleetAccess("acct-1");

  expect(mocks.requireObjectAccessMany).toHaveBeenCalledWith(
    "acct-1",
    [
      { serverId: "s1", org: "acme" },
      { serverId: "s1", org: "widgets" },
    ],
    "nodes",
    "read",
  );
  expect(result.contexts).toEqual([
    { serverId: "s1", org: "acme", ctx: ctx("s1", "acme"), serverName: "Server One" },
  ]);
  expect(result.failedScopes).toEqual(
    expect.arrayContaining([
      { serverName: "Server Two", org: "*", reason: "unreachable" },
      { serverName: "Server One", org: "widgets", reason: "access denied" },
    ]),
  );
});

test("resolveFleetAccess short-circuits to no contexts when there are zero reachable scopes", async () => {
  mocks.listReachableScopes.mockResolvedValue({ scopes: [], unavailable: [] });
  const result = await resolveFleetAccess("acct-1");
  expect(result).toEqual({ contexts: [], failedScopes: [] });
  expect(mocks.requireObjectAccessMany).not.toHaveBeenCalled();
});

// --- loadAggregatedFleetSnapshot ---------------------------------------------

const contexts = [
  { serverId: "s1", serverName: "Server One", org: "acme", ctx: ctx("s1", "acme") },
  { serverId: "s2", serverName: "Server Two", org: "widgets", ctx: ctx("s2", "widgets") },
];

test("merges nodes from every succeeded scope, each tagged with its own server/org/href", async () => {
  mocks.fetchFleetNodes.mockImplementation(async (c: AuthorizedActionContext) =>
    c.serverId === "s1" ? [fleetNode({ name: "web01" })] : [fleetNode({ name: "db01" })],
  );

  const { snapshot, failedScopes } = await loadAggregatedFleetSnapshot(contexts, NOW);

  expect(failedScopes).toEqual([]);
  expect(snapshot.stats.total).toBe(2);
  const byName = Object.fromEntries(snapshot.nodes.map((n) => [n.name, n]));
  expect(byName.web01).toMatchObject({ server: "Server One", org: "acme", href: "/servers/s1/orgs/acme/nodes/web01" });
  expect(byName.db01).toMatchObject({ server: "Server Two", org: "widgets", href: "/servers/s2/orgs/widgets/nodes/db01" });
});

test("one scope's fetchFleetNodes rejecting doesn't blank the dashboard", async () => {
  mocks.fetchFleetNodes.mockImplementation(async (c: AuthorizedActionContext) => {
    if (c.serverId === "s1") throw new Error("boom");
    return [fleetNode({ name: "db01" })];
  });

  const { snapshot, failedScopes } = await loadAggregatedFleetSnapshot(contexts, NOW);

  expect(snapshot.nodes.map((n) => n.name)).toEqual(["db01"]);
  expect(failedScopes).toEqual([{ serverName: "Server One", org: "acme", reason: "unreachable" }]);
});

test("a hung scope times out instead of blocking the whole sweep", async () => {
  vi.useFakeTimers();
  mocks.fetchFleetNodes.mockImplementation(async (c: AuthorizedActionContext) => {
    if (c.serverId === "s1") return new Promise<FleetNode[]>(() => {}); // never resolves
    return [fleetNode({ name: "db01" })];
  });

  const pending = loadAggregatedFleetSnapshot(contexts, NOW);
  await vi.advanceTimersByTimeAsync(15_000);
  const { snapshot, failedScopes } = await pending;

  expect(snapshot.nodes.map((n) => n.name)).toEqual(["db01"]);
  expect(failedScopes).toEqual([{ serverName: "Server One", org: "acme", reason: "timed out" }]);
});

test("classifies the merged fleet once, so a fleet-wide version ceiling applies to every org", async () => {
  // org A only has v18 nodes, org B only has v19 -- with no lifecycle data,
  // classifying each org separately would read org A's v18 as "current"
  // against its own local ceiling. Classifying the merge once must instead
  // apply the fleet-wide v19 ceiling to both.
  mocks.fetchFleetNodes.mockImplementation(async (c: AuthorizedActionContext) =>
    c.serverId === "s1"
      ? [fleetNode({ name: "old-node", chefVersion: "18.0.0" })]
      : [fleetNode({ name: "new-node", chefVersion: "19.0.0" })],
  );

  const { snapshot } = await loadAggregatedFleetSnapshot(contexts, NOW);

  expect(snapshot.stats.latestMajor).toBe(19);
  const oldNode = snapshot.nodes.find((n) => n.name === "old-node")!;
  const newNode = snapshot.nodes.find((n) => n.name === "new-node")!;
  expect(oldNode.clientStatus).toBe("major-behind");
  expect(newNode.clientStatus).toBe("current");
});

test("two nodes with the same name from different scopes both appear with distinct hrefs", async () => {
  mocks.fetchFleetNodes.mockResolvedValue([fleetNode({ name: "web01" })]);

  const { snapshot } = await loadAggregatedFleetSnapshot(contexts, NOW);

  const webNodes = snapshot.nodes.filter((n) => n.name === "web01");
  expect(webNodes).toHaveLength(2);
  expect(new Set(webNodes.map((n) => n.href)).size).toBe(2);
});

// --- fetchAggregatedFleetCounts -----------------------------------------------

test("sums only succeeded scopes and never zero-fills a failed one", async () => {
  mocks.fetchFleetCounts.mockImplementation(async (c: AuthorizedActionContext) =>
    c.serverId === "s1"
      ? { recent: 5, missing: 1, unconfigured: 2 }
      : { recent: null, missing: null, unconfigured: null }, // s2 degraded internally
  );

  const { counts, failedScopes } = await fetchAggregatedFleetCounts(contexts, NOW);

  expect(counts).toEqual({ recent: 5, missing: 1, unconfigured: 2 });
  expect(failedScopes).toEqual([{ serverName: "Server Two", org: "widgets", reason: "counts unavailable" }]);
});

test("degrades the whole result to null only when every scope fails", async () => {
  mocks.fetchFleetCounts.mockResolvedValue({ recent: null, missing: null, unconfigured: null });
  const { counts, failedScopes } = await fetchAggregatedFleetCounts(contexts, NOW);
  expect(counts).toEqual({ recent: null, missing: null, unconfigured: null });
  expect(failedScopes).toHaveLength(2);
});

test("zero contexts degrades to null counts with no failures", async () => {
  const { counts, failedScopes } = await fetchAggregatedFleetCounts([], NOW);
  expect(counts).toEqual({ recent: null, missing: null, unconfigured: null });
  expect(failedScopes).toEqual([]);
});
