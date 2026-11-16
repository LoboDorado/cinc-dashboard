// @vitest-environment node
import { expect, test } from "vitest";
import { toSummary, toProfile, type RawComplianceReport } from "./compliance-shape";

function rawReport(overrides: Partial<Record<string, unknown>> = {}): RawComplianceReport {
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
  } as RawComplianceReport;
}

test("toSummary maps the raw PascalCase envelope to the camelCase summary", () => {
  const summary = toSummary(rawReport());
  expect(summary).toEqual({
    reportId: "report-1",
    org: "acme",
    nodeName: "web01",
    environment: "prod",
    status: "passed",
    controlsPassed: 10,
    controlsFailed: 0,
    controlsSkipped: 0,
    startTime: "2026-01-01T00:00:00Z",
    endTime: "2026-01-01T00:01:00Z",
  });
});

test("toProfile carries a control's tags through unparsed", () => {
  const profile = toProfile({
    name: "linux-baseline",
    controls: [
      {
        id: "sshd-01",
        impact: 1,
        tags: { nist: ["AC-6"], severity: "high" },
        results: [],
      },
    ],
  });
  expect(profile.controls[0].tags).toEqual({ nist: ["AC-6"], severity: "high" });
});

test("toProfile defaults a control's tags to undefined when absent", () => {
  const profile = toProfile({ name: "p", controls: [{ id: "c1", impact: 0, results: [] }] });
  expect(profile.controls[0].tags).toBeUndefined();
});
