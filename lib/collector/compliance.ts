import "server-only";
import { requireObjectAccess } from "../admin/access";
import { getCollectorsForServer, type DecryptedCollector } from "../admin/collectors";
import { collectorRequest, type CollectorConnection } from "./client";
import { isCollectorError } from "./errors";
import { cincPath } from "../cinc/path";
import { partitionScoped, type ScopedOutcome } from "../cinc/aggregate";
import {
  toSummary,
  toDetail,
  type RawComplianceReport,
  type ComplianceReportSummary,
  type ComplianceReportDetail,
} from "./compliance-shape";

export type {
  ComplianceReportSummary,
  ComplianceControlResult,
  ComplianceControl,
  ComplianceProfile,
  ComplianceReportDetail,
} from "./compliance-shape";

function toConnection(c: DecryptedCollector): CollectorConnection {
  return {
    collectorId: c.id,
    baseUrl: c.baseUrl,
    bearerToken: c.bearerToken,
    caCert: c.caCert,
    tlsNoVerify: c.tlsNoVerify,
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
