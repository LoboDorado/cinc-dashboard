// Shared compliance wire-shape parsing, used both by the per-node loader
// (compliance.ts) and the fleet-wide search fan-out (compliance-search.ts) --
// a search result is the same store.ComplianceReport shape plus a Relevance
// score, so both call sites parse identically.
import "server-only";

export type ComplianceReportSummary = {
  reportId: string;
  org: string;
  nodeName: string;
  environment: string;
  status: string;
  controlsPassed: number | null;
  controlsFailed: number | null;
  controlsSkipped: number | null;
  startTime: string;
  endTime: string | null;
};

export type ComplianceControlResult = {
  status: string;
  codeDesc: string;
  runTime: number;
  startTime: string;
  skipMessage?: string;
  message?: string;
  exception?: string;
  resourceClass?: string;
  resourceId?: string;
};

export type ComplianceControl = {
  id: string;
  title?: string;
  desc?: string;
  impact: number;
  /** automate.Control.Tags -- InSpec's own tag shape varies (hash or array)
   *  across profiles/versions, so this is passed through unparsed; a UI
   *  that wants to filter/display it scans it as opaque data, never a typed
   *  structure. */
  tags?: unknown;
  sourceLocation?: { ref: string; line: number };
  results: ComplianceControlResult[];
};

export type ComplianceProfile = {
  name: string;
  version?: string;
  title?: string;
  summary?: string;
  status?: string;
  statusMessage?: string;
  skipMessage?: string;
  controls: ComplianceControl[];
};

export type ComplianceReportDetail = ComplianceReportSummary & {
  profiles: ComplianceProfile[];
  rawReport: unknown;
};

// The wire shape of cinc-collector's store.ComplianceReport: untagged Go
// struct fields -> raw PascalCase. The list endpoint (GET /nodes/{name}/compliance),
// the by-id endpoint (GET /compliance/reports/{id}), and the search endpoint
// (GET /compliance/search, whose SearchResult embeds this plus Relevance)
// all return this same full shape -- none of them project a lighter summary.
// `Profiles`/`RawReport` are themselves json.RawMessage on the Go side, so
// they arrive as already-nested JSON, not strings to re-parse.
export type RawComplianceReport = {
  ReportID: string;
  Org: string;
  NodeName: string;
  Environment: string;
  Status: string;
  ControlsPassed: number | null;
  ControlsFailed: number | null;
  ControlsSkipped: number | null;
  StartTime: string;
  EndTime: string | null;
  Profiles: RawProfile[] | null;
  RawReport: unknown;
};

// Unlike the envelope above, the nested compliance structs
// (automate.Profile/Control/Result/SourceLocation) carry explicit snake_case
// json tags -- confirmed by reading cinc-collector's
// internal/automate/messages.go directly. Don't assume PascalCase here.
type RawProfile = {
  name: string;
  version?: string;
  title?: string;
  summary?: string;
  status?: string;
  status_message?: string;
  skip_message?: string;
  controls?: RawControl[];
};

type RawControl = {
  id: string;
  title?: string;
  desc?: string;
  impact: number;
  tags?: unknown;
  source_location?: { ref: string; line: number };
  results?: RawResult[];
};

type RawResult = {
  status: string;
  code_desc: string;
  run_time: number;
  start_time: string;
  skip_message?: string;
  message?: string;
  exception?: string;
  resource_class?: string;
  resource_id?: string;
};

export function toSummary(r: RawComplianceReport): ComplianceReportSummary {
  return {
    reportId: r.ReportID,
    org: r.Org,
    nodeName: r.NodeName,
    environment: r.Environment,
    status: r.Status,
    controlsPassed: r.ControlsPassed,
    controlsFailed: r.ControlsFailed,
    controlsSkipped: r.ControlsSkipped,
    startTime: r.StartTime,
    endTime: r.EndTime,
  };
}

function toResult(r: RawResult): ComplianceControlResult {
  return {
    status: r.status,
    codeDesc: r.code_desc,
    runTime: r.run_time,
    startTime: r.start_time,
    skipMessage: r.skip_message,
    message: r.message,
    exception: r.exception,
    resourceClass: r.resource_class,
    resourceId: r.resource_id,
  };
}

function toControl(c: RawControl): ComplianceControl {
  return {
    id: c.id,
    title: c.title,
    desc: c.desc,
    impact: c.impact,
    tags: c.tags,
    sourceLocation: c.source_location,
    results: (c.results ?? []).map(toResult),
  };
}

export function toProfile(p: RawProfile): ComplianceProfile {
  return {
    name: p.name,
    version: p.version,
    title: p.title,
    summary: p.summary,
    status: p.status,
    statusMessage: p.status_message,
    skipMessage: p.skip_message,
    controls: (p.controls ?? []).map(toControl),
  };
}

export function toDetail(r: RawComplianceReport): ComplianceReportDetail {
  return {
    ...toSummary(r),
    profiles: (r.Profiles ?? []).map(toProfile),
    rawReport: r.RawReport,
  };
}
