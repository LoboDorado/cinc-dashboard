// The eager, capped "current compliance posture of the fleet" fetch that
// powers the Compliance page's default Overview/Nodes/Profiles/Controls
// tabs -- unlike compliance-search.ts (which calls the real search endpoint
// and requires a non-empty query), this fetches every reachable node's
// latest report directly, so the page has something to show without the
// user typing anything first.
//
// The node universe comes from cinc-server-ng itself (resolveFleetAccess +
// fetchFleetNodes, the exact pair the Fleet dashboard uses), NOT from the
// collector's own GET /api/v0/nodes -- that endpoint is populated only by
// chef-client run_start/run_converge messages (see cinc-collector's
// ingestRunConverge), so a node that has only ever had an InSpec compliance
// report ingested (never a chef-client run) would never appear in it. A
// node can legitimately have compliance data with zero CCR history, so the
// candidate set has to be "every node cinc-server-ng knows about," with the
// collector consulted only per-node for whether it has a report -- the same
// universe the Nodes list itself uses.
import "server-only";
import { resolveFleetAccess, type FailedScope } from "../cinc/fleet-aggregate";
import { fetchFleetNodes } from "../cinc/search";
import { getCollectorsForServer, type DecryptedCollector } from "../admin/collectors";
import { toConnection, withTimeout, COLLECTOR_TIMEOUT_MS } from "./node-fields";
import { collectorRequest } from "./client";
import { cincPath } from "../cinc/path";
import { toSummary, toProfile, type RawComplianceReport } from "./compliance-shape";
import { complianceReportPath } from "../urls";
import type { FleetComplianceResult } from "./compliance-search";

// A generous but bounded ceiling: GET /nodes/{name}/compliance is one round
// trip per node, so "every reachable node" could mean hundreds of calls --
// same "pick a number, document it" tradeoff as node-fields.ts's own
// NODES_LIMIT/compliance-search.ts's DEFAULT_LIMIT_PER_COLLECTOR.
const DEFAULT_NODE_CAP = 200;

// Simple sequential-chunk batching, not a generic concurrency-limiter --
// this is a bounded, one-shot fetch, not a reusable primitive. Keeps one
// collector from being hit with up to 200 simultaneous requests.
const BATCH_SIZE = 20;

export type FleetComplianceOverview = {
  results: FleetComplianceResult[];
  /** How many distinct nodes were actually queried for a report (post-cap). */
  nodesConsidered: number;
  /** How many distinct nodes were reachable before the cap was applied. */
  totalReachableNodes: number;
  truncated: boolean;
  failedScopes: FailedScope[];
};

export type FleetComplianceOverviewOutcome =
  | { state: "no_collector" }
  | ({ state: "overview" } & FleetComplianceOverview);

type NodeEntry = { serverId: string; serverName: string; org: string; nodeName: string; collector: DecryptedCollector };

/**
 * The fleet's current compliance posture: the latest report for every node
 * `accountId` can reach, capped at `cap` nodes total. Access-gated by
 * resolveFleetAccess -- identical "nodes","read" check the Fleet dashboard
 * itself uses; a collector read is just an alternate data source for a node
 * the caller can already read, no new RBAC dimension.
 *
 * Per-node failures (a single compliance fetch erroring or timing out) are
 * silently omitted from `results`, not reported in `failedScopes` -- at this
 * volume (up to `cap` independent calls) per-node noise would drown out the
 * signal that actually matters: a whole scope being unreachable, which still
 * surfaces via `failedScopes`. A server with no collector linked is also a
 * quiet omission (nothing to fetch there), not a failure.
 */
export async function loadDefaultFleetComplianceOverview(
  accountId: string,
  cap: number = DEFAULT_NODE_CAP,
): Promise<FleetComplianceOverviewOutcome> {
  const { contexts, failedScopes: accessFailedScopes } = await resolveFleetAccess(accountId);
  if (contexts.length === 0) return { state: "no_collector" };

  const distinctServerIds = [...new Set(contexts.map((c) => c.serverId))];
  const collectorsByServerId = new Map(
    await Promise.all(
      distinctServerIds.map(async (id) => [id, await getCollectorsForServer(id)] as const),
    ),
  );
  if ([...collectorsByServerId.values()].every((list) => list.length === 0)) {
    return { state: "no_collector" };
  }

  const audit = { accountId: contexts[0].ctx.accountId, onBehalfOf: contexts[0].ctx.onBehalfOf };

  const nodeOutcomes = await Promise.all(
    contexts.map(async (c) => {
      try {
        const nodes = await withTimeout(fetchFleetNodes(c.ctx), COLLECTOR_TIMEOUT_MS);
        return { ...c, ok: true as const, nodes };
      } catch {
        return { ...c, ok: false as const, nodes: [] as Awaited<ReturnType<typeof fetchFleetNodes>> };
      }
    }),
  );

  const failedScopes: FailedScope[] = [
    ...accessFailedScopes,
    ...nodeOutcomes
      .filter((o) => !o.ok)
      .map((o) => ({ serverName: o.serverName, org: o.org, reason: "unreachable" })),
  ];

  // Flatten into every (server, org, node) cinc-server-ng reports, deduped,
  // paired with that server's linked collector (one collector per server is
  // the documented assumption elsewhere too -- see node-fields.ts). A server
  // with no linked collector contributes no entries, not an error.
  const seen = new Set<string>();
  const nodeEntries: NodeEntry[] = [];
  for (const o of nodeOutcomes) {
    if (!o.ok) continue;
    const collector = (collectorsByServerId.get(o.serverId) ?? [])[0];
    if (!collector) continue;
    for (const n of o.nodes) {
      const key = `${o.serverId}::${o.org}::${n.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      nodeEntries.push({ serverId: o.serverId, serverName: o.serverName, org: o.org, nodeName: n.name, collector });
    }
  }

  const totalReachableNodes = nodeEntries.length;
  const truncated = totalReachableNodes > cap;
  const capped = nodeEntries.slice(0, cap);

  const results: FleetComplianceResult[] = [];
  for (let i = 0; i < capped.length; i += BATCH_SIZE) {
    const batch = capped.slice(i, i + BATCH_SIZE);
    const batchRaw = await Promise.all(
      batch.map(async (entry): Promise<RawComplianceReport | null> => {
        try {
          const data = await withTimeout(
            collectorRequest<RawComplianceReport[]>(toConnection(entry.collector), audit, {
              method: "GET",
              path: cincPath`/api/v0/nodes/${entry.nodeName}/compliance`,
              query: { limit: 1 },
              auditAction: "collector_compliance.list",
            }),
            COLLECTOR_TIMEOUT_MS,
          );
          return data[0] ?? null; // no reports for this node -- omitted below, not an error
        } catch {
          return null; // one node's failure/timeout is silently omitted, see doc comment above
        }
      }),
    );
    batchRaw.forEach((raw, j) => {
      if (!raw) return;
      const entry = batch[j];
      // Defensive re-check, same principle as compliance-search.ts's own
      // cross-org filter -- cheap insurance against drift between the two.
      if (raw.Org !== entry.org || raw.NodeName !== entry.nodeName) return;
      results.push({
        ...toSummary(raw),
        // No BM25 score exists for a direct per-node fetch; sorted by
        // recency in the UI instead, not relevance -- this value is unused.
        relevance: 1,
        profiles: (raw.Profiles ?? []).map(toProfile),
        serverId: entry.serverId,
        serverName: entry.serverName,
        href: complianceReportPath(entry.serverId, raw.Org, raw.NodeName, raw.ReportID),
      });
    });
  }

  return {
    state: "overview",
    results,
    nodesConsidered: capped.length,
    totalReachableNodes,
    truncated,
    failedScopes,
  };
}
