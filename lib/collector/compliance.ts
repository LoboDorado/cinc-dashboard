import "server-only";
import { requireObjectAccess } from "../admin/access";
import { getCollectorsForServer, type DecryptedCollector } from "../admin/collectors";
import { collectorRequest, type CollectorConnection } from "./client";
import { isCollectorError } from "./errors";
import { cincPath } from "../cinc/path";
import { partitionScoped, type ScopedOutcome } from "../cinc/aggregate";

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
// struct fields -> raw PascalCase. Both the list endpoint
// (GET /nodes/{name}/compliance) and the by-id endpoint
// (GET /compliance/reports/{id}) return this same full shape -- the list
// endpoint's SQL selects every column, not a lighter summary projection.
// `Profiles`/`RawReport` are themselves json.RawMessage on the Go side, so
// they arrive as already-nested JSON, not strings to re-parse.
type RawComplianceReport = {
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

function toConnection(c: DecryptedCollector): CollectorConnection {
  return {
    collectorId: c.id,
    baseUrl: c.baseUrl,
    bearerToken: c.bearerToken,
    caCert: c.caCert,
    tlsNoVerify: c.tlsNoVerify,
  };
}

function toSummary(r: RawComplianceReport): ComplianceReportSummary {
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
    sourceLocation: c.source_location,
    results: (c.results ?? []).map(toResult),
  };
}

function toProfile(p: RawProfile): ComplianceProfile {
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

function toDetail(r: RawComplianceReport): ComplianceReportDetail {
  return {
    ...toSummary(r),
    profiles: (r.Profiles ?? []).map(toProfile),
    rawReport: r.RawReport,
  };
}

/**
 * The ONLY function that may turn a raw /compliance/reports/{id} response
 * into a typed report. That endpoint takes no org argument server-side (any
 * valid token for any org can fetch any report by UUID), so this check --
 * not the collector's own API -- is what stops a cross-org leak through this
 * dashboard route. A mismatch returns null, meaning "not this one," not an
 * error: a different linked collector might legitimately hold this id for a
 * different org/node.
 */
function parseVerifiedReport(
  raw: RawComplianceReport,
  expect: { org: string; nodeName: string },
): ComplianceReportDetail | null {
  if (raw.Org !== expect.org || raw.NodeName !== expect.nodeName) return null;
  return toDetail(raw);
}

function explainCollectorError(e: unknown): string {
  return isCollectorError(e) ? `collector error (${e.status})` : "collector unreachable";
}

export type NodeComplianceResult =
  | { state: "no_collector" }
  | { state: "empty" }
  | { state: "reports"; reports: ComplianceReportSummary[] }
  | { state: "error"; reason: string };

/**
 * Compliance scan history for one node, merged across every collector linked
 * to its server (ordinarily just one; more than one only if a server hosts
 * multiple orgs, each with its own collector registration -- see the plan's
 * "one bearer token = one org" note). Throws AccessDeniedError, same as
 * requireObjectAccess itself, for the caller (a route handler) to translate
 * into the usual {error:"forbidden"} shape -- this return type only covers
 * "given access is allowed, what did the collector(s) say."
 */
export async function loadNodeCompliance(
  accountId: string,
  serverId: string,
  org: string,
  nodeName: string,
  limit = 50,
): Promise<NodeComplianceResult> {
  const ctx = await requireObjectAccess(accountId, serverId, org, "nodes", "read");
  const collectors = await getCollectorsForServer(serverId);
  if (collectors.length === 0) return { state: "no_collector" };

  // ScopedOutcome/partitionScoped are shaped for fanning out across (server,org)
  // scopes; reused here across collectors within ONE scope by repurposing its
  // serverId/serverName fields to hold the collector's own id/name instead --
  // the partition logic itself only cares about the ok/data|error shape.
  const outcomes: ScopedOutcome<RawComplianceReport[]>[] = await Promise.all(
    collectors.map(async (c): Promise<ScopedOutcome<RawComplianceReport[]>> => {
      try {
        const data = await collectorRequest<RawComplianceReport[]>(
          toConnection(c),
          { accountId: ctx.accountId, onBehalfOf: ctx.onBehalfOf, serverId, org },
          {
            method: "GET",
            path: cincPath`/api/v0/nodes/${nodeName}/compliance`,
            query: { limit },
            auditAction: "collector_compliance.list",
          },
        );
        return { serverId: c.id, serverName: c.name, org, ok: true, data };
      } catch (e) {
        return { serverId: c.id, serverName: c.name, org, ok: false, error: explainCollectorError(e) };
      }
    }),
  );
  const { succeeded, failed } = partitionScoped(outcomes);

  // A 200 [] (wrong-org collector, or right org with genuinely zero scans) is
  // a normal success, not a failure signal -- see the plan's Correction 2.
  const reports = succeeded
    .flatMap((o) => o.data)
    .filter((r) => r.Org === org && r.NodeName === nodeName)
    .map(toSummary)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  if (reports.length > 0) return { state: "reports", reports };
  // Every collector actually failed (not just empty) -- don't let an outage
  // masquerade as "no compliance data".
  if (succeeded.length === 0 && failed.length > 0) {
    return { state: "error", reason: failed[0].error };
  }
  return { state: "empty" };
}

export type ComplianceReportLookup =
  | { state: "found"; report: ComplianceReportDetail }
  | { state: "not_found" }
  | { state: "no_collector" }
  | { state: "error"; reason: string };

/**
 * One compliance report by id, scoped to the (server, org, node) the caller
 * claims it belongs to. Tries each linked collector sequentially, stopping at
 * the first match -- GET /compliance/reports/{id} genuinely 404s per-row
 * (unlike the list endpoint), so a 404 means "try the next collector," while
 * any other error means "a real outage," not "keep guessing."
 */
export async function loadComplianceReportById(
  accountId: string,
  serverId: string,
  org: string,
  nodeName: string,
  reportId: string,
): Promise<ComplianceReportLookup> {
  const ctx = await requireObjectAccess(accountId, serverId, org, "nodes", "read");
  const collectors = await getCollectorsForServer(serverId);
  if (collectors.length === 0) return { state: "no_collector" };

  for (const c of collectors) {
    let raw: RawComplianceReport;
    try {
      raw = await collectorRequest<RawComplianceReport>(
        toConnection(c),
        { accountId: ctx.accountId, onBehalfOf: ctx.onBehalfOf, serverId, org },
        {
          method: "GET",
          path: cincPath`/api/v0/compliance/reports/${reportId}`,
          auditAction: "collector_compliance.get",
        },
      );
    } catch (e) {
      if (isCollectorError(e) && e.notFound) continue;
      return { state: "error", reason: explainCollectorError(e) };
    }
    const verified = parseVerifiedReport(raw, { org, nodeName });
    if (verified) return { state: "found", report: verified };
    // Org/NodeName mismatch -- a different collector might legitimately hold
    // this id for a different org/node; keep looping rather than giving up.
  }
  return { state: "not_found" };
}
