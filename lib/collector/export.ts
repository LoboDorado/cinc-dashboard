// NOT server-only, unlike every other file in this directory: this runs
// client-side, at the moment a user clicks "Export CSV"/"Export JSON" in
// components/compliance/fleet-compliance-search.tsx. Do not add
// `import "server-only"` here even though its sibling modules all have it --
// that import throws immediately when evaluated in a browser bundle.
import type { FleetComplianceResult } from "./compliance-search";

export type ComplianceExportRow = {
  server: string;
  org: string;
  nodeName: string;
  environment: string;
  status: string;
  controlsPassed: number | "";
  controlsFailed: number | "";
  controlsSkipped: number | "";
  startTime: string;
  endTime: string;
  reportUrl: string;
};

/** One row per report, never per control -- control-level detail stays
 *  reachable via each row's reportUrl (the existing report-detail page). */
export function toExportRows(results: FleetComplianceResult[]): ComplianceExportRow[] {
  return results.map((r) => ({
    server: r.serverName,
    org: r.org,
    nodeName: r.nodeName,
    environment: r.environment,
    status: r.status,
    controlsPassed: r.controlsPassed ?? "",
    controlsFailed: r.controlsFailed ?? "",
    controlsSkipped: r.controlsSkipped ?? "",
    startTime: r.startTime,
    endTime: r.endTime ?? "",
    reportUrl: r.href,
  }));
}

const CSV_HEADER: (keyof ComplianceExportRow)[] = [
  "server",
  "org",
  "nodeName",
  "environment",
  "status",
  "controlsPassed",
  "controlsFailed",
  "controlsSkipped",
  "startTime",
  "endTime",
  "reportUrl",
];

/** Quote-wraps and doubles embedded quotes only when the value actually
 *  needs it (contains a comma, quote, or newline) -- plain values stay bare. */
export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(rows: ComplianceExportRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const row of rows) {
    lines.push(CSV_HEADER.map((key) => csvEscape(String(row[key]))).join(","));
  }
  return lines.join("\r\n");
}

export function toJson(rows: ComplianceExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}
