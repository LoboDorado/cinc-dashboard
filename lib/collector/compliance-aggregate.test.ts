import { expect, test } from "vitest";
import {
  controlStatus,
  computeOverviewStats,
  computeNodeRows,
  computeProfileRows,
  computeControlRows,
} from "./compliance-aggregate";
import type { ComplianceControl, ComplianceControlResult } from "./compliance-shape";
import type { FleetComplianceResult } from "./compliance-search";

function result(status: ComplianceControlResult["status"]): ComplianceControlResult {
  return { status, codeDesc: "desc", runTime: 0, startTime: "2026-01-01T00:00:00Z" };
}

function control(overrides: Partial<ComplianceControl> & { id: string }): ComplianceControl {
  return { title: undefined, desc: undefined, impact: 0.5, results: [], ...overrides };
}

function fleetResult(overrides: Partial<FleetComplianceResult> = {}): FleetComplianceResult {
  return {
    reportId: "r1",
    org: "acme",
    nodeName: "web01",
    environment: "prod",
    status: "passed",
    controlsPassed: 0,
    controlsFailed: 0,
    controlsSkipped: 0,
    startTime: "2026-01-01T00:00:00Z",
    endTime: null,
    relevance: 1,
    profiles: [],
    serverId: "s1",
    serverName: "Server One",
    href: "/servers/s1/orgs/acme/nodes/web01/compliance/r1",
    ...overrides,
  };
}

// --- controlStatus: mirrors cinc-collector's internal/automate/parse.go exactly ---

test("controlStatus: zero results -> skipped", () => {
  expect(controlStatus(control({ id: "c1", results: [] }))).toBe("skipped");
});

test("controlStatus: any failed result -> failed, even among other statuses", () => {
  expect(
    controlStatus(control({ id: "c1", results: [result("passed"), result("failed"), result("skipped")] })),
  ).toBe("failed");
});

test("controlStatus: all results skipped -> skipped", () => {
  expect(controlStatus(control({ id: "c1", results: [result("skipped"), result("skipped")] }))).toBe(
    "skipped",
  );
});

test("controlStatus: a mix of passed/skipped with no failures -> passed", () => {
  expect(controlStatus(control({ id: "c1", results: [result("passed"), result("skipped")] }))).toBe(
    "passed",
  );
});

// --- Shared fixture: two nodes sharing a profile and a control id ---

const web01 = fleetResult({
  reportId: "r1",
  nodeName: "web01",
  status: "passed",
  controlsPassed: 2,
  controlsFailed: 0,
  controlsSkipped: 0,
  startTime: "2026-01-01T00:00:00Z",
  profiles: [
    {
      name: "linux-baseline",
      title: "Linux Baseline",
      controls: [
        control({ id: "sshd-01", title: "SSH config", impact: 0.7, results: [result("passed")] }),
        control({ id: "sshd-02", title: "SSH port", impact: 0.5, results: [result("passed")] }),
      ],
    },
  ],
});

const web02 = fleetResult({
  reportId: "r2",
  nodeName: "web02",
  status: "failed",
  controlsPassed: 1,
  controlsFailed: 1,
  controlsSkipped: 0,
  startTime: "2026-01-02T00:00:00Z",
  profiles: [
    {
      name: "linux-baseline",
      title: "Linux Baseline",
      controls: [
        control({ id: "sshd-01", title: "SSH config", impact: 0.7, results: [result("failed")] }),
        control({ id: "other-control", title: "Other", impact: 0.3, results: [result("passed")] }),
      ],
    },
  ],
});

const fixture = [web01, web02];

test("computeOverviewStats: totals, and top-failing controls/profiles", () => {
  const stats = computeOverviewStats(fixture);
  expect(stats.totalNodes).toBe(2);
  expect(stats.totalReports).toBe(2);
  expect(stats.controlsPassed).toBe(3);
  expect(stats.controlsFailed).toBe(1);
  expect(stats.controlsSkipped).toBe(0);
  expect(stats.topFailingControls).toEqual([{ id: "sshd-01", title: "SSH config", failCount: 1 }]);
  expect(stats.topFailingProfiles).toEqual([
    { name: "linux-baseline", title: "Linux Baseline", failCount: 1 },
  ]);
});

test("computeNodeRows: one row per node", () => {
  const rows = computeNodeRows(fixture);
  expect(rows).toHaveLength(2);
  const byName = Object.fromEntries(rows.map((r) => [r.nodeName, r]));
  expect(byName.web01).toMatchObject({ status: "passed", controlsPassed: 2, controlsFailed: 0 });
  expect(byName.web02).toMatchObject({ status: "failed", controlsPassed: 1, controlsFailed: 1 });
});

test("computeNodeRows: keeps the most recent report when the same node appears twice", () => {
  const older = fleetResult({ reportId: "r-old", nodeName: "web01", status: "passed", startTime: "2026-01-01T00:00:00Z" });
  const newer = fleetResult({ reportId: "r-new", nodeName: "web01", status: "failed", startTime: "2026-01-03T00:00:00Z" });
  const rows = computeNodeRows([older, newer]);
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe("failed");
});

test("computeProfileRows: aggregates a profile across every node it appears on", () => {
  const rows = computeProfileRows(fixture);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    name: "linux-baseline",
    nodeCount: 2,
    controlsPassed: 3, // web01: sshd-01, sshd-02 both pass; web02: other-control passes
    controlsFailed: 1, // web02: sshd-01 fails
    controlsSkipped: 0,
  });
});

test("computeControlRows: aggregates a control id across every profile/report it appears in", () => {
  const rows = computeControlRows(fixture);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  expect(byId["sshd-01"]).toMatchObject({
    profileNames: ["linux-baseline"],
    passCount: 1,
    failCount: 1,
    skipCount: 0,
  });
  expect(byId["sshd-02"]).toMatchObject({ passCount: 1, failCount: 0, skipCount: 0 });
  expect(byId["other-control"]).toMatchObject({ passCount: 1, failCount: 0, skipCount: 0 });
});
