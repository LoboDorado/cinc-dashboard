// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";
import { CollectorError } from "./errors";

const { getCollectorsForServer, collectorRequest } = vi.hoisted(() => ({
  getCollectorsForServer: vi.fn(),
  collectorRequest: vi.fn(),
}));

vi.mock("../admin/collectors", () => ({ getCollectorsForServer }));
vi.mock("./client", () => ({ collectorRequest }));

import { loadCollectorNodeFields, loadCollectorNodeAttributes } from "./node-fields";

const AUDIT = { accountId: "account-1", onBehalfOf: "alice" };

function fakeCollector(id: string, name = id) {
  return { id, name, baseUrl: `https://${id}.example.com`, bearerToken: "tok", tlsNoVerify: false };
}

function rawNode(overrides: Partial<Record<string, unknown>> = {}) {
  return { Org: "acme", Name: "web01", LastCCRStatus: "success", ...overrides };
}

beforeEach(() => {
  getCollectorsForServer.mockReset();
  collectorRequest.mockReset();
});

test("no scopes -> empty result, no calls at all", async () => {
  const result = await loadCollectorNodeFields([], AUDIT);
  expect(result).toEqual({ fields: new Map(), failedScopes: [] });
  expect(getCollectorsForServer).not.toHaveBeenCalled();
});

test("a server with no linked collector contributes nothing and is not a failure", async () => {
  getCollectorsForServer.mockResolvedValue([]);
  const result = await loadCollectorNodeFields(
    [{ serverId: "server-1", serverName: "Server One", org: "acme" }],
    AUDIT,
  );
  expect(result.fields.size).toBe(0);
  expect(result.failedScopes).toEqual([]);
  expect(collectorRequest).not.toHaveBeenCalled();
});

test("merges a collector's node list keyed by the response's own Org/Name", async () => {
  getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
  collectorRequest.mockResolvedValue([
    rawNode({ Name: "web01", LastCCRStatus: "success" }),
    rawNode({ Name: "web02", LastCCRStatus: "failure" }),
  ]);
  const result = await loadCollectorNodeFields(
    [{ serverId: "server-1", serverName: "Server One", org: "acme" }],
    AUDIT,
  );
  expect(result.fields.get("server-1::acme::web01")).toEqual({ lastCCRStatus: "success" });
  expect(result.fields.get("server-1::acme::web02")).toEqual({ lastCCRStatus: "failure" });
});

test("normalizes any LastCCRStatus other than success/failure (including empty) to null", async () => {
  getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
  collectorRequest.mockResolvedValue([rawNode({ LastCCRStatus: "" })]);
  const result = await loadCollectorNodeFields(
    [{ serverId: "server-1", serverName: "Server One", org: "acme" }],
    AUDIT,
  );
  expect(result.fields.get("server-1::acme::web01")).toEqual({ lastCCRStatus: null });
});

test("a collector linked to two servers in the given scopes is queried exactly once", async () => {
  const shared = fakeCollector("shared-collector");
  getCollectorsForServer.mockImplementation(async (serverId: string) =>
    serverId === "server-1" || serverId === "server-2" ? [shared] : [],
  );
  collectorRequest.mockResolvedValue([rawNode({ Org: "acme", Name: "web01" })]);

  const result = await loadCollectorNodeFields(
    [
      { serverId: "server-1", serverName: "Server One", org: "acme" },
      { serverId: "server-2", serverName: "Server Two", org: "acme" },
    ],
    AUDIT,
  );

  expect(collectorRequest).toHaveBeenCalledTimes(1);
  // Applied to every server that collector is linked to among the given scopes.
  expect(result.fields.get("server-1::acme::web01")).toEqual({ lastCCRStatus: "success" });
  expect(result.fields.get("server-2::acme::web01")).toEqual({ lastCCRStatus: "success" });
});

test("one collector's failure degrades only the scopes it covers, not an unrelated server's", async () => {
  getCollectorsForServer.mockImplementation(async (serverId: string) =>
    serverId === "server-1" ? [fakeCollector("c-bad")] : [fakeCollector("c-good")],
  );
  collectorRequest.mockImplementation(async (conn: { collectorId: string }) => {
    if (conn.collectorId === "c-bad") throw new CollectorError(500, { error: ["boom"] });
    return [rawNode({ Org: "beta", Name: "web02" })];
  });

  const result = await loadCollectorNodeFields(
    [
      { serverId: "server-1", serverName: "Server One", org: "acme" },
      { serverId: "server-2", serverName: "Server Two", org: "beta" },
    ],
    AUDIT,
  );

  expect(result.failedScopes).toEqual([
    { serverId: "server-1", serverName: "Server One", reason: "collector error (500)" },
  ]);
  expect(result.fields.get("server-2::beta::web02")).toEqual({ lastCCRStatus: "success" });
});

test("loadCollectorNodeAttributes: no scopes -> empty result, no calls at all", async () => {
  const result = await loadCollectorNodeAttributes([], AUDIT);
  expect(result).toEqual({ attributesByKey: new Map(), failedScopes: [] });
  expect(getCollectorsForServer).not.toHaveBeenCalled();
});

test("loadCollectorNodeAttributes: a collector linked to two servers is queried exactly once", async () => {
  const shared = fakeCollector("shared-collector");
  getCollectorsForServer.mockImplementation(async (serverId: string) =>
    serverId === "server-1" || serverId === "server-2" ? [shared] : [],
  );
  collectorRequest.mockResolvedValue([
    rawNode({ Org: "acme", Name: "web01", Attributes: { platform: "ubuntu" } }),
  ]);

  const result = await loadCollectorNodeAttributes(
    [
      { serverId: "server-1", serverName: "Server One", org: "acme" },
      { serverId: "server-2", serverName: "Server Two", org: "acme" },
    ],
    AUDIT,
  );

  expect(collectorRequest).toHaveBeenCalledTimes(1);
  expect(result.attributesByKey.get("server-1::acme::web01")).toEqual({ platform: "ubuntu" });
  expect(result.attributesByKey.get("server-2::acme::web01")).toEqual({ platform: "ubuntu" });
});

test("loadCollectorNodeAttributes: merges keyed by the response's own Org/Name, defaulting missing Attributes to null", async () => {
  getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
  collectorRequest.mockResolvedValue([rawNode({ Name: "web01", Attributes: undefined })]);
  const result = await loadCollectorNodeAttributes(
    [{ serverId: "server-1", serverName: "Server One", org: "acme" }],
    AUDIT,
  );
  expect(result.attributesByKey.get("server-1::acme::web01")).toBeNull();
});

test("loadCollectorNodeAttributes: one collector's failure degrades only the scopes it covers", async () => {
  getCollectorsForServer.mockImplementation(async (serverId: string) =>
    serverId === "server-1" ? [fakeCollector("c-bad")] : [fakeCollector("c-good")],
  );
  collectorRequest.mockImplementation(async (conn: { collectorId: string }) => {
    if (conn.collectorId === "c-bad") throw new CollectorError(500, { error: ["boom"] });
    return [rawNode({ Org: "beta", Name: "web02", Attributes: { platform: "debian" } })];
  });

  const result = await loadCollectorNodeAttributes(
    [
      { serverId: "server-1", serverName: "Server One", org: "acme" },
      { serverId: "server-2", serverName: "Server Two", org: "beta" },
    ],
    AUDIT,
  );

  expect(result.failedScopes).toEqual([
    { serverId: "server-1", serverName: "Server One", reason: "collector error (500)" },
  ]);
  expect(result.attributesByKey.get("server-2::beta::web02")).toEqual({ platform: "debian" });
});
