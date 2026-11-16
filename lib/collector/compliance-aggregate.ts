// Pure aggregation over an already-fetched FleetComplianceResult[] working
// set -- no I/O here. Every tab on the fleet Compliance page (Overview,
// Nodes, Profiles, Controls) is one of these functions applied to whichever
// working set is currently active (the default overview fetch, or live
// search results); switching tabs is a pure re-render, never a new fetch.
import type { ComplianceControl, ComplianceProfile } from "./compliance-shape";
import type { FleetComplianceResult } from "./compliance-search";

/**
 * Ports cinc-collector's own internal/automate/parse.go controlStatus
 * exactly (confirmed by reading that file directly, not guessed): a control
 * with any failed result is "failed"; a control with zero results, or whose
 * results are all "skipped", is "skipped"; otherwise "passed". This is the
 * server's own rollup convention -- reused here, not reinvented, so the
 * Profiles/Controls tabs classify the same way the server itself would.
 */
export function controlStatus(control: ComplianceControl): "passed" | "failed" | "skipped" {
  if (control.results.length === 0) return "skipped";
  let allSkipped = true;
  for (const result of control.results) {
    if (result.status === "failed") return "failed";
    if (result.status !== "skipped") allSkipped = false;
  }
  return allSkipped ? "skipped" : "passed";
}

function nodeKey(r: FleetComplianceResult): string {
  return `${r.serverId}::${r.org}::${r.nodeName}`;
}

export type OverviewStats = {
  totalNodes: number;
  totalReports: number;
  controlsPassed: number;
  controlsFailed: number;
  controlsSkipped: number;
  topFailingControls: { id: string; title?: string; failCount: number }[];
  topFailingProfiles: { name: string; title?: string; failCount: number }[];
};

export function computeOverviewStats(results: FleetComplianceResult[]): OverviewStats {
  const nodeKeys = new Set<string>();
  let controlsPassed = 0;
  let controlsFailed = 0;
  let controlsSkipped = 0;
  const controlFails = new Map<string, { title?: string; failCount: number }>();
  const profileFails = new Map<string, { title?: string; failCount: number }>();

  for (const r of results) {
    nodeKeys.add(nodeKey(r));
    // Report-level totals are safe to sum here -- each result is one whole
    // report, unlike a profile's or control's own tally, which has to be
    // computed fresh (see computeProfileRows/computeControlRows below).
    controlsPassed += r.controlsPassed ?? 0;
    controlsFailed += r.controlsFailed ?? 0;
    controlsSkipped += r.controlsSkipped ?? 0;

    for (const profile of r.profiles) {
      let profileFailed = false;
      for (const control of profile.controls) {
        if (controlStatus(control) !== "failed") continue;
        profileFailed = true;
        const entry = controlFails.get(control.id) ?? { title: control.title, failCount: 0 };
        entry.failCount++;
        controlFails.set(control.id, entry);
      }
      if (profileFailed) {
        const entry = profileFails.get(profile.name) ?? { title: profile.title, failCount: 0 };
        entry.failCount++;
        profileFails.set(profile.name, entry);
      }
    }
  }

  const topFailingControls = [...controlFails.entries()]
    .map(([id, v]) => ({ id, title: v.title, failCount: v.failCount }))
    .sort((a, b) => b.failCount - a.failCount)
    .slice(0, 5);
  const topFailingProfiles = [...profileFails.entries()]
    .map(([name, v]) => ({ name, title: v.title, failCount: v.failCount }))
    .sort((a, b) => b.failCount - a.failCount)
    .slice(0, 5);

  return {
    totalNodes: nodeKeys.size,
    totalReports: results.length,
    controlsPassed,
    controlsFailed,
    controlsSkipped,
    topFailingControls,
    topFailingProfiles,
  };
}

export type ComplianceNodeRow = {
  serverId: string;
  serverName: string;
  org: string;
  nodeName: string;
  status: string;
  controlsPassed: number;
  controlsFailed: number;
  controlsSkipped: number;
  startTime: string;
  href: string;
};

/**
 * One row per distinct node. The capped default overview fetch only ever
 * carries one report per node, but live search results can legitimately
 * surface more than one report for the same node -- keep the most recent.
 */
export function computeNodeRows(results: FleetComplianceResult[]): ComplianceNodeRow[] {
  const byNode = new Map<string, FleetComplianceResult>();
  for (const r of results) {
    const key = nodeKey(r);
    const existing = byNode.get(key);
    if (!existing || new Date(r.startTime).getTime() > new Date(existing.startTime).getTime()) {
      byNode.set(key, r);
    }
  }
  return [...byNode.values()].map((r) => ({
    serverId: r.serverId,
    serverName: r.serverName,
    org: r.org,
    nodeName: r.nodeName,
    status: r.status,
    controlsPassed: r.controlsPassed ?? 0,
    controlsFailed: r.controlsFailed ?? 0,
    controlsSkipped: r.controlsSkipped ?? 0,
    startTime: r.startTime,
    href: r.href,
  }));
}

export type ComplianceProfileRow = {
  name: string;
  title?: string;
  nodeCount: number;
  controlsPassed: number;
  controlsFailed: number;
  controlsSkipped: number;
};

export function computeProfileRows(results: FleetComplianceResult[]): ComplianceProfileRow[] {
  type Entry = { title?: string; nodeKeys: Set<string>; passed: number; failed: number; skipped: number };
  const byName = new Map<string, Entry>();

  for (const r of results) {
    const seenProfileNamesForThisResult = new Set<string>();
    for (const profile of r.profiles) {
      const entry = byName.get(profile.name) ?? {
        title: profile.title,
        nodeKeys: new Set<string>(),
        passed: 0,
        failed: 0,
        skipped: 0,
      };
      if (!seenProfileNamesForThisResult.has(profile.name)) {
        entry.nodeKeys.add(nodeKey(r));
        seenProfileNamesForThisResult.add(profile.name);
      }
      for (const control of profile.controls) {
        const status = controlStatus(control);
        if (status === "passed") entry.passed++;
        else if (status === "failed") entry.failed++;
        else entry.skipped++;
      }
      byName.set(profile.name, entry);
    }
  }

  return [...byName.entries()].map(([name, v]) => ({
    name,
    title: v.title,
    nodeCount: v.nodeKeys.size,
    controlsPassed: v.passed,
    controlsFailed: v.failed,
    controlsSkipped: v.skipped,
  }));
}

export type ComplianceControlRow = {
  id: string;
  title?: string;
  impact: number;
  profileNames: string[];
  passCount: number;
  failCount: number;
  skipCount: number;
};

export function computeControlRows(results: FleetComplianceResult[]): ComplianceControlRow[] {
  type Entry = { title?: string; impact: number; profileNames: Set<string>; pass: number; fail: number; skip: number };
  const byId = new Map<string, Entry>();

  for (const r of results) {
    for (const profile of r.profiles) {
      for (const control of profile.controls) {
        const entry = byId.get(control.id) ?? {
          title: control.title,
          impact: control.impact,
          profileNames: new Set<string>(),
          pass: 0,
          fail: 0,
          skip: 0,
        };
        entry.profileNames.add(profile.name);
        const status = controlStatus(control);
        if (status === "passed") entry.pass++;
        else if (status === "failed") entry.fail++;
        else entry.skip++;
        byId.set(control.id, entry);
      }
    }
  }

  return [...byId.entries()].map(([id, v]) => ({
    id,
    title: v.title,
    impact: v.impact,
    profileNames: [...v.profileNames],
    passCount: v.pass,
    failCount: v.fail,
    skipCount: v.skip,
  }));
}

// Re-exported so callers only need to import from this module and
// compliance-shape.ts, not reach into compliance-shape.ts directly just for
// these two types.
export type { ComplianceControl, ComplianceProfile };
