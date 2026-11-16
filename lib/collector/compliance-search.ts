import "server-only";
import { listReachableScopes, requireObjectAccessMany } from "../admin/access";
import { getCollectorsForServer, type DecryptedCollector } from "../admin/collectors";
import { collectorRequest, type CollectorConnection } from "./client";
import { isCollectorError } from "./errors";
import { cincPath } from "../cinc/path";
import { partitionScoped, type ScopedOutcome } from "../cinc/aggregate";
import { toSummary, toProfile, type RawComplianceReport, type ComplianceProfile, type ComplianceReportSummary } from "./compliance-shape";
import { complianceReportPath } from "../urls";
import type { FailedCollectorScope } from "./node-fields";

type RawSearchResult = RawComplianceReport & { Relevance: number };

export type FleetComplianceResult = ComplianceReportSummary & {
  relevance: number;
  /** Carried through so the "refine" tag-contains filter can scan controls
   *  already in hand -- never re-fetched per refinement keystroke. */
  profiles: ComplianceProfile[];
  serverId: string;
  serverName: string;
  href: string;
};

export type FleetComplianceSearchParams = {
  q: string;
  status?: "passed" | "failed" | "skipped";
  limit?: number;
};

export type FleetComplianceSearchOutcome =
  | { state: "no_collector" }
  | {
      state: "results";
      results: FleetComplianceResult[];
      /** UI's basis for "results capped at limit × N collectors queried". */
      queriedCollectors: number;
      limitPerCollector: number;
      failedScopes: FailedCollectorScope[];
    };

// Higher than loadNodeCompliance's per-node default of 50: this is the
// primary browse surface, one query already fans out across every reachable
// collector, and BM25 relevance ordering means a higher ceiling surfaces
// more relevant matches rather than crowding good ones out with junk.
const DEFAULT_LIMIT_PER_COLLECTOR = 100;

function explainCollectorError(e: unknown): string {
  return isCollectorError(e) ? `collector error (${e.status})` : "collector unreachable";
}

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
 * Searches every collector reachable from any (server,org) scope `accountId`
 * can read nodes in, merges the results, and discards anything whose own Org
 * doesn't match a scope the caller is actually entitled to -- necessary
 * because getCollectorsForServer is keyed by SERVER, not by org, so a server
 * hosting two orgs' collectors returns both even if the caller is only
 * entitled to one of them (same cross-org safety principle as
 * compliance.ts's parseVerifiedReport, applied across a whole result set
 * instead of one report).
 *
 * caller contract: `params.q` must already be non-empty -- cinc-collector's
 * own search endpoint 400s on a blank query, and this module doesn't retry
 * or substitute a default; enforcement lives at the route handler, same
 * division of labor as loadNodeCompliance assuming a valid nodeName.
 */
export async function searchFleetCompliance(
  accountId: string,
  params: FleetComplianceSearchParams,
): Promise<FleetComplianceSearchOutcome> {
  const limit = params.limit ?? DEFAULT_LIMIT_PER_COLLECTOR;
  const { scopes } = await listReachableScopes(accountId);
  const { contexts } = await requireObjectAccessMany(
    accountId,
    scopes.map(({ serverId, org }) => ({ serverId, org })),
    "nodes",
    "read",
  );
  if (contexts.length === 0) return { state: "no_collector" };

  const serverNameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));
  const allowedOrgsByServerId = new Map<string, Set<string>>();
  for (const { serverId, org } of contexts) {
    const set = allowedOrgsByServerId.get(serverId) ?? new Set<string>();
    set.add(org);
    allowedOrgsByServerId.set(serverId, set);
  }

  // Dedup by distinct serverId, then by distinct collectorId -- identical
  // shape to loadCollectorNodeFields's own dedup (node-fields.ts).
  const distinctServerIds = [...new Set(contexts.map((c) => c.serverId))];
  const collectorsByServerId = new Map(
    await Promise.all(distinctServerIds.map(async (id) => [id, await getCollectorsForServer(id)] as const)),
  );
  const byCollectorId = new Map<string, { collector: DecryptedCollector; serverIds: Set<string> }>();
  for (const serverId of distinctServerIds) {
    for (const collector of collectorsByServerId.get(serverId) ?? []) {
      const entry = byCollectorId.get(collector.id);
      if (entry) entry.serverIds.add(serverId);
      else byCollectorId.set(collector.id, { collector, serverIds: new Set([serverId]) });
    }
  }
  if (byCollectorId.size === 0) return { state: "no_collector" };

  // Audit attribution only, not serverId/org-scoped -- one collector call
  // here doesn't map to one (server,org) pair, the same compromise
  // loadCollectorNodeFields's own call sites already make.
  const audit = { accountId: contexts[0].ctx.accountId, onBehalfOf: contexts[0].ctx.onBehalfOf };

  const outcomes: ScopedOutcome<RawSearchResult[]>[] = await Promise.all(
    [...byCollectorId.values()].map(async ({ collector }): Promise<ScopedOutcome<RawSearchResult[]>> => {
      try {
        const query: Record<string, string | number> = { q: params.q, limit };
        if (params.status) query.status = params.status;
        const data = await collectorRequest<RawSearchResult[]>(
          toConnection(collector),
          audit,
          { method: "GET", path: cincPath`/api/v0/compliance/search`, query, auditAction: "collector_compliance.search" },
        );
        return { serverId: collector.id, serverName: collector.name, org: "*", ok: true, data };
      } catch (e) {
        return { serverId: collector.id, serverName: collector.name, org: "*", ok: false, error: explainCollectorError(e) };
      }
    }),
  );
  const { succeeded, failed } = partitionScoped(outcomes);

  const results: FleetComplianceResult[] = [];
  for (const outcome of succeeded) {
    const entry = byCollectorId.get(outcome.serverId); // holds the collector's own id, see note above
    if (!entry) continue;
    for (const raw of outcome.data) {
      // One collector linked to >1 server: emit once per server whose
      // allowed orgs actually include this result's org -- no signal exists
      // in the response of which physical server a row belongs to, same
      // documented limitation as node-fields.ts; usually resolves to exactly
      // one server.
      for (const serverId of entry.serverIds) {
        if (!allowedOrgsByServerId.get(serverId)?.has(raw.Org)) continue;
        results.push({
          ...toSummary(raw),
          relevance: raw.Relevance,
          profiles: (raw.Profiles ?? []).map(toProfile),
          serverId,
          serverName: serverNameOf.get(serverId) ?? serverId,
          href: complianceReportPath(serverId, raw.Org, raw.NodeName, raw.ReportID),
        });
      }
    }
  }
  // Relevance is only locally comparable within one collector's own BM25
  // computation -- merging across collectors is a heuristic ordering, not a
  // normalized fleet-wide rank.
  results.sort((a, b) => b.relevance - a.relevance || +new Date(b.startTime) - +new Date(a.startTime));

  const failedScopes: FailedCollectorScope[] = failed.flatMap((f) => {
    const entry = byCollectorId.get(f.serverId); // f.serverId holds the collector's own id, see note above
    if (!entry) return [];
    return [...entry.serverIds].map((serverId) => ({
      serverId,
      serverName: serverNameOf.get(serverId) ?? serverId,
      reason: f.error,
    }));
  });
  return { state: "results", results, queriedCollectors: byCollectorId.size, limitPerCollector: limit, failedScopes };
}
