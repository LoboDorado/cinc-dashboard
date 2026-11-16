import { expect, test } from "vitest";
import { toExportRows, toCsv, toJson, csvEscape, type ComplianceExportRow } from "./export";
import type { FleetComplianceResult } from "./compliance-search";

function fakeResult(overrides: Partial<FleetComplianceResult> = {}): FleetComplianceResult {
  return {
    reportId: "r1",
    org: "acme",
    nodeName: "web01",
    environment: "prod",
    status: "failed",
    controlsPassed: 3,
    controlsFailed: 1,
    controlsSkipped: 0,
    startTime: "2026-01-01T00:00:00Z",
    endTime: "2026-01-01T00:01:00Z",
    relevance: 1.5,
    profiles: [],
    serverId: "s1",
    serverName: "default",
    href: "/servers/s1/orgs/acme/nodes/web01/compliance/r1",
    ...overrides,
  };
}

test("toExportRows maps one row per report, not per control", () => {
  const rows = toExportRows([fakeResult(), fakeResult({ reportId: "r2" })]);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toEqual({
    server: "default",
    org: "acme",
    nodeName: "web01",
    environment: "prod",
    status: "failed",
    controlsPassed: 3,
    controlsFailed: 1,
    controlsSkipped: 0,
    startTime: "2026-01-01T00:00:00Z",
    endTime: "2026-01-01T00:01:00Z",
    reportUrl: "/servers/s1/orgs/acme/nodes/web01/compliance/r1",
  } satisfies ComplianceExportRow);
});

test("toExportRows falls back to empty string for null control counts/endTime", () => {
  const rows = toExportRows([
    fakeResult({ controlsPassed: null, controlsFailed: null, controlsSkipped: null, endTime: null }),
  ]);
  expect(rows[0].controlsPassed).toBe("");
  expect(rows[0].controlsFailed).toBe("");
  expect(rows[0].controlsSkipped).toBe("");
  expect(rows[0].endTime).toBe("");
});

test("csvEscape leaves plain values untouched", () => {
  expect(csvEscape("passed")).toBe("passed");
});

test("csvEscape quotes and doubles embedded quotes/commas/newlines", () => {
  expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  expect(csvEscape("a,b")).toBe('"a,b"');
  expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
});

test("toCsv emits a header row plus one escaped row per entry, CRLF-joined", () => {
  const rows = toExportRows([fakeResult({ nodeName: "web,01" })]);
  const csv = toCsv(rows);
  const lines = csv.split("\r\n");
  expect(lines[0]).toBe(
    "server,org,nodeName,environment,status,controlsPassed,controlsFailed,controlsSkipped,startTime,endTime,reportUrl",
  );
  expect(lines[1]).toContain('"web,01"');
});

test("toJson round-trips via JSON.parse", () => {
  const rows = toExportRows([fakeResult()]);
  expect(JSON.parse(toJson(rows))).toEqual(rows);
});
