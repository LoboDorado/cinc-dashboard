// @vitest-environment node
import { describe, expect, test, vi, beforeEach } from "vitest";
import { CollectorError } from "./errors";

const { requireObjectAccess, getCollectorsForServer, collectorRequest } = vi.hoisted(() => ({
  requireObjectAccess: vi.fn(),
  getCollectorsForServer: vi.fn(),
  collectorRequest: vi.fn(),
}));

vi.mock("../admin/access", () => ({ requireObjectAccess, AccessDeniedError: class AccessDeniedError extends Error {} }));
vi.mock("../admin/collectors", () => ({ getCollectorsForServer }));
vi.mock("./client", () => ({ collectorRequest }));

import { loadNodeCompliance, loadComplianceReportById } from "./compliance";

const FAKE_CTX = { accountId: "account-1", onBehalfOf: "alice", serverId: "server-1", org: "acme" };

function fakeCollector(id: string, name = id) {
  return { id, name, baseUrl: `https://${id}.example.com`, bearerToken: "tok", tlsNoVerify: false };
}

function rawReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ReportID: "report-1",
    Org: "acme",
    NodeName: "web01",
    Environment: "prod",
    Status: "passed",
    ControlsPassed: 10,
    ControlsFailed: 0,
    ControlsSkipped: 0,
    StartTime: "2026-01-01T00:00:00Z",
    EndTime: "2026-01-01T00:01:00Z",
    Profiles: [],
    RawReport: {},
    ...overrides,
  };
}

beforeEach(() => {
  requireObjectAccess.mockReset().mockResolvedValue(FAKE_CTX);
  getCollectorsForServer.mockReset();
  collectorRequest.mockReset();
});

describe("loadNodeCompliance", () => {
  test("returns no_collector when nothing is linked to the server", async () => {
    getCollectorsForServer.mockResolvedValue([]);
    const result = await loadNodeCompliance("account-1", "server-1", "acme", "web01");
    expect(result).toEqual({ state: "no_collector" });
    expect(collectorRequest).not.toHaveBeenCalled();
  });

  test("a 200 [] response is a normal empty result, not an error", async () => {
    getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
    collectorRequest.mockResolvedValue([]);
    const result = await loadNodeCompliance("account-1", "server-1", "acme", "web01");
    expect(result).toEqual({ state: "empty" });
  });

  test("merges and sorts reports across every linked collector, most recent first", async () => {
    getCollectorsForServer.mockResolvedValue([fakeCollector("c1"), fakeCollector("c2")]);
    collectorRequest
      .mockResolvedValueOnce([rawReport({ ReportID: "r-old", StartTime: "2026-01-01T00:00:00Z" })])
      .mockResolvedValueOnce([rawReport({ ReportID: "r-new", StartTime: "2026-02-01T00:00:00Z" })]);
    const result = await loadNodeCompliance("account-1", "server-1", "acme", "web01");
    expect(result.state).toBe("reports");
    if (result.state === "reports") {
      expect(result.reports.map((r) => r.reportId)).toEqual(["r-new", "r-old"]);
    }
  });

  test("drops reports from a collector that answered for the wrong org/node", async () => {
    getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
    collectorRequest.mockResolvedValue([rawReport({ Org: "other-org" })]);
    const result = await loadNodeCompliance("account-1", "server-1", "acme", "web01");
    expect(result).toEqual({ state: "empty" });
  });

  test("every collector erroring surfaces as error, not a misleading empty", async () => {
    getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
    collectorRequest.mockRejectedValue(new CollectorError(500, { error: ["boom"] }));
    const result = await loadNodeCompliance("account-1", "server-1", "acme", "web01");
    expect(result.state).toBe("error");
  });

  test("one collector failing doesn't blank reports a different collector returned", async () => {
    getCollectorsForServer.mockResolvedValue([fakeCollector("c1"), fakeCollector("c2")]);
    collectorRequest
      .mockRejectedValueOnce(new CollectorError(500, { error: ["boom"] }))
      .mockResolvedValueOnce([rawReport()]);
    const result = await loadNodeCompliance("account-1", "server-1", "acme", "web01");
    expect(result.state).toBe("reports");
  });

  test("propagates AccessDeniedError for the caller to translate", async () => {
    const { AccessDeniedError } = await import("../admin/access");
    requireObjectAccess.mockRejectedValue(new AccessDeniedError());
    await expect(loadNodeCompliance("account-1", "server-1", "acme", "web01")).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
  });
});

describe("loadComplianceReportById", () => {
  test("returns no_collector when nothing is linked to the server", async () => {
    getCollectorsForServer.mockResolvedValue([]);
    const result = await loadComplianceReportById("account-1", "server-1", "acme", "web01", "report-1");
    expect(result).toEqual({ state: "no_collector" });
  });

  test("a collector's report with the wrong org/node is treated as a miss, not a match", async () => {
    getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
    collectorRequest.mockResolvedValue(rawReport({ Org: "other-org" }));
    const result = await loadComplianceReportById("account-1", "server-1", "acme", "web01", "report-1");
    expect(result).toEqual({ state: "not_found" });
  });

  test("stops at the first collector that actually matches org and node", async () => {
    getCollectorsForServer.mockResolvedValue([fakeCollector("c1"), fakeCollector("c2")]);
    collectorRequest
      .mockResolvedValueOnce(rawReport({ Org: "other-org" }))
      .mockResolvedValueOnce(rawReport());
    const result = await loadComplianceReportById("account-1", "server-1", "acme", "web01", "report-1");
    expect(result.state).toBe("found");
    if (result.state === "found") {
      expect(result.report.reportId).toBe("report-1");
    }
    expect(collectorRequest).toHaveBeenCalledTimes(2);
  });

  test("a 404 from one collector tries the next, rather than failing immediately", async () => {
    getCollectorsForServer.mockResolvedValue([fakeCollector("c1"), fakeCollector("c2")]);
    collectorRequest
      .mockRejectedValueOnce(new CollectorError(404, { error: ["not found"] }))
      .mockResolvedValueOnce(rawReport());
    const result = await loadComplianceReportById("account-1", "server-1", "acme", "web01", "report-1");
    expect(result.state).toBe("found");
  });

  test("exhausting every collector with no match is not_found", async () => {
    getCollectorsForServer.mockResolvedValue([fakeCollector("c1")]);
    collectorRequest.mockRejectedValue(new CollectorError(404, { error: ["not found"] }));
    const result = await loadComplianceReportById("account-1", "server-1", "acme", "web01", "report-1");
    expect(result).toEqual({ state: "not_found" });
  });

  test("a non-404 failure stops immediately rather than masking an outage", async () => {
    getCollectorsForServer.mockResolvedValue([fakeCollector("c1"), fakeCollector("c2")]);
    collectorRequest.mockRejectedValue(new CollectorError(500, { error: ["boom"] }));
    const result = await loadComplianceReportById("account-1", "server-1", "acme", "web01", "report-1");
    expect(result.state).toBe("error");
    expect(collectorRequest).toHaveBeenCalledTimes(1);
  });
});
