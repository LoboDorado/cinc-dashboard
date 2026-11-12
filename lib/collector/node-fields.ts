import "server-only";
import { getCollectorsForServer, type DecryptedCollector } from "../admin/collectors";
import { collectorRequest, type CollectorConnection, type CollectorAuditContext } from "./client";
import { isCollectorError } from "./errors";
import { cincPath } from "../cinc/path";
import { partitionScoped, type ScopedOutcome } from "../cinc/aggregate";

export type CollectorNodeFields = { lastCCRStatus: "success" | "failure" | null };
export type FailedCollectorScope = { serverId: string; serverName: string; reason: string };

type RawNode = { Org: string; Name: string; LastCCRStatus: string };

// GET /api/v0/nodes has only a limit, no offset/cursor -- a generous request
// is the only mitigation available; an org with more nodes than this is
// silently truncated server-side with no `total` to detect it against.
const NODES_LIMIT = 5000;

// Mirrors lib/cinc/fleet-aggregate.ts's PER_SCOPE_TIMEOUT_MS -- a shared
// aggregated page now pays for a slow collector on every viewer's behalf.
const COLLECTOR_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("collector timed out")), ms);
    }),
  ]);
}

function explainCollectorError(e: unknown): string {
  if (e instanceof Error && e.message === "collector timed out") return "timed out";
  return isCollectorError(e) ? `collector error (${e.status})` : "collector unreachable";
}

function normalize(status: string): "success" | "failure" | null {
  return status === "success" || status === "failure" ? status : null;
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
 * Bulk-loads the one collector-only field the Nodes-list facets need
 * (LastCCRStatus) across every given (server,org) scope, keyed by
 * `${serverId}::${org}::${name}` using the Org/Name the COLLECTOR ITSELF
 * reported for each row -- not which collector or token happened to answer.
 *
 * Dedupes by distinct serverId first (one getCollectorsForServer call per
 * server, mirroring lib/admin/access.ts's mintContextsMany server-decrypt
 * dedup), then by distinct collectorId (a single collector can be linked to
 * more than one registered server; call it once, not once per server).
 *
 * Caller contract: `scopes` must already be access-filtered (drawn from
 * requireObjectAccessMany's contexts, not raw listReachableScopes) -- this
 * function does no access check of its own, the same division of labor
 * lib/cinc/fleet-aggregate.ts's resolveFleetAccess/loadAggregatedFleetSnapshot
 * split has.
 *
 * Documented limitation: if one collector is linked to more than one
 * registered server, its /nodes response carries no signal of which
 * physical server a node actually lives on -- this applies that collector's
 * data to every server it's linked to among `scopes`. A same-org-same-name
 * collision across two servers sharing one collector could misattribute
 * converge status. Not fixable without a cinc-collector API change;
 * realistically rare given one collector token fixes one org, which in
 * practice maps to one Cinc Server.
 */
export async function loadCollectorNodeFields(
  scopes: ReadonlyArray<{ serverId: string; serverName: string; org: string }>,
  audit: CollectorAuditContext,
): Promise<{ fields: Map<string, CollectorNodeFields>; failedScopes: FailedCollectorScope[] }> {
  if (scopes.length === 0) return { fields: new Map(), failedScopes: [] };

  const distinctServerIds = [...new Set(scopes.map((s) => s.serverId))];
  const collectorsByServerId = new Map(
    await Promise.all(
      distinctServerIds.map(async (id) => [id, await getCollectorsForServer(id)] as const),
    ),
  );

  // Flatten into distinct collectors, each remembering every serverId (among
  // the given scopes) it's linked to -- a collector linked to several
  // servers is queried once, not once per server.
  const byCollectorId = new Map<string, { collector: DecryptedCollector; serverIds: Set<string> }>();
  for (const serverId of distinctServerIds) {
    for (const collector of collectorsByServerId.get(serverId) ?? []) {
      const entry = byCollectorId.get(collector.id);
      if (entry) entry.serverIds.add(serverId);
      else byCollectorId.set(collector.id, { collector, serverIds: new Set([serverId]) });
    }
  }

  const serverNameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));

  // ScopedOutcome/partitionScoped are shaped for (server,org) scopes; reused
  // here across collectors by repurposing serverId/serverName to hold the
  // collector's own id/name ("org" is unused -- one collector covers a whole
  // org via its own token, not one call per org). The partition logic itself
  // only cares about the ok/data|error shape.
  const outcomes: ScopedOutcome<RawNode[]>[] = await Promise.all(
    [...byCollectorId.values()].map(async ({ collector }): Promise<ScopedOutcome<RawNode[]>> => {
      try {
        const data = await withTimeout(
          collectorRequest<RawNode[]>(toConnection(collector), audit, {
            method: "GET",
            path: cincPath`/api/v0/nodes`,
            query: { limit: NODES_LIMIT },
            auditAction: "collector_nodes.list",
          }),
          COLLECTOR_TIMEOUT_MS,
        );
        return { serverId: collector.id, serverName: collector.name, org: "*", ok: true, data };
      } catch (e) {
        return {
          serverId: collector.id,
          serverName: collector.name,
          org: "*",
          ok: false,
          error: explainCollectorError(e),
        };
      }
    }),
  );
  const { succeeded, failed } = partitionScoped(outcomes);

  const fields = new Map<string, CollectorNodeFields>();
  for (const outcome of succeeded) {
    const entry = byCollectorId.get(outcome.serverId); // outcome.serverId holds the collector's own id, see note above
    if (!entry) continue;
    for (const serverId of entry.serverIds) {
      for (const n of outcome.data) {
        fields.set(`${serverId}::${n.Org}::${n.Name}`, { lastCCRStatus: normalize(n.LastCCRStatus) });
      }
    }
  }

  const failedScopes: FailedCollectorScope[] = failed.flatMap((f) => {
    const entry = byCollectorId.get(f.serverId);
    if (!entry) return [];
    return [...entry.serverIds].map((serverId) => ({
      serverId,
      serverName: serverNameOf.get(serverId) ?? serverId,
      reason: f.error,
    }));
  });

  return { fields, failedScopes };
}
