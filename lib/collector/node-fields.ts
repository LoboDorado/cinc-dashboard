import "server-only";
import { getCollectorsForServer, type DecryptedCollector } from "../admin/collectors";
import { collectorRequest, type CollectorConnection, type CollectorAuditContext } from "./client";
import { isCollectorError } from "./errors";
import { cincPath } from "../cinc/path";
import { partitionScoped, type ScopedOutcome } from "../cinc/aggregate";

export type CollectorNodeFields = { lastCCRStatus: "success" | "failure" | null };
export type FailedCollectorScope = { serverId: string; serverName: string; reason: string };

export type RawNode = { Org: string; Name: string; LastCCRStatus: string; Attributes?: unknown };

// GET /api/v0/nodes has only a limit, no offset/cursor -- a generous request
// is the only mitigation available; an org with more nodes than this is
// silently truncated server-side with no `total` to detect it against.
const NODES_LIMIT = 5000;

// Mirrors lib/cinc/fleet-aggregate.ts's PER_SCOPE_TIMEOUT_MS -- a shared
// aggregated page now pays for a slow collector on every viewer's behalf.
export const COLLECTOR_TIMEOUT_MS = 15_000;

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
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

export function toConnection(c: DecryptedCollector): CollectorConnection {
  return {
    collectorId: c.id,
    baseUrl: c.baseUrl,
    bearerToken: c.bearerToken,
    caCert: c.caCert,
    tlsNoVerify: c.tlsNoVerify,
  };
}

export type CollectorEntry = { collector: DecryptedCollector; serverIds: Set<string> };

/**
 * Shared fan-out skeleton for `loadCollectorNodeFields`/`loadCollectorNodeAttributes`:
 * dedupes by distinct serverId first (one getCollectorsForServer call per
 * server, mirroring lib/admin/access.ts's mintContextsMany server-decrypt
 * dedup), then by distinct collectorId (a single collector can be linked to
 * more than one registered server; call it once, not once per server), then
 * fetches each distinct collector's full `/api/v0/nodes` list exactly once.
 *
 * Caller contract: `scopes` must already be access-filtered (drawn from
 * requireObjectAccessMany's contexts, not raw listReachableScopes) -- this
 * function does no access check of its own, the same division of labor
 * lib/cinc/fleet-aggregate.ts's resolveFleetAccess/loadAggregatedFleetSnapshot
 * split has.
 *
 * Documented limitation: if one collector is linked to more than one
 * registered server, its /nodes response carries no signal of which
 * physical server a node actually lives on -- callers apply that collector's
 * data to every server it's linked to among `scopes`. A same-org-same-name
 * collision across two servers sharing one collector could misattribute a
 * node's data. Not fixable without a cinc-collector API change; realistically
 * rare given one collector token fixes one org, which in practice maps to
 * one Cinc Server.
 */
export async function fetchRawNodesByScope(
  scopes: ReadonlyArray<{ serverId: string; serverName: string; org: string }>,
  audit: CollectorAuditContext,
): Promise<{
  succeeded: Extract<ScopedOutcome<RawNode[]>, { ok: true }>[];
  failed: Extract<ScopedOutcome<RawNode[]>, { ok: false }>[];
  byCollectorId: Map<string, CollectorEntry>;
  serverNameOf: Map<string, string>;
}> {
  const distinctServerIds = [...new Set(scopes.map((s) => s.serverId))];
  const collectorsByServerId = new Map(
    await Promise.all(
      distinctServerIds.map(async (id) => [id, await getCollectorsForServer(id)] as const),
    ),
  );

  // Flatten into distinct collectors, each remembering every serverId (among
  // the given scopes) it's linked to -- a collector linked to several
  // servers is queried once, not once per server.
  const byCollectorId = new Map<string, CollectorEntry>();
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
  return { succeeded, failed, byCollectorId, serverNameOf };
}

export function buildFailedScopes(
  failed: Extract<ScopedOutcome<RawNode[]>, { ok: false }>[],
  byCollectorId: Map<string, CollectorEntry>,
  serverNameOf: Map<string, string>,
): FailedCollectorScope[] {
  return failed.flatMap((f) => {
    const entry = byCollectorId.get(f.serverId); // f.serverId holds the collector's own id, see fetchRawNodesByScope
    if (!entry) return [];
    return [...entry.serverIds].map((serverId) => ({
      serverId,
      serverName: serverNameOf.get(serverId) ?? serverId,
      reason: f.error,
    }));
  });
}

/**
 * Bulk-loads the one collector-only field the Nodes-list facets need
 * (LastCCRStatus) across every given (server,org) scope, keyed by
 * `${serverId}::${org}::${name}` using the Org/Name the COLLECTOR ITSELF
 * reported for each row -- not which collector or token happened to answer.
 */
export async function loadCollectorNodeFields(
  scopes: ReadonlyArray<{ serverId: string; serverName: string; org: string }>,
  audit: CollectorAuditContext,
): Promise<{ fields: Map<string, CollectorNodeFields>; failedScopes: FailedCollectorScope[] }> {
  if (scopes.length === 0) return { fields: new Map(), failedScopes: [] };
  const { succeeded, failed, byCollectorId, serverNameOf } = await fetchRawNodesByScope(scopes, audit);

  const fields = new Map<string, CollectorNodeFields>();
  for (const outcome of succeeded) {
    const entry = byCollectorId.get(outcome.serverId); // outcome.serverId holds the collector's own id, see fetchRawNodesByScope
    if (!entry) continue;
    for (const serverId of entry.serverIds) {
      for (const n of outcome.data) {
        fields.set(`${serverId}::${n.Org}::${n.Name}`, { lastCCRStatus: normalize(n.LastCCRStatus) });
      }
    }
  }

  return { fields, failedScopes: buildFailedScopes(failed, byCollectorId, serverNameOf) };
}

export type NodeAttributesResult = { attributesByKey: Map<string, unknown>; failedScopes: FailedCollectorScope[] };

/**
 * Lazy companion to `loadCollectorNodeFields`, sharing its fan-out: bulk-loads
 * each node's full `Attributes` ohai document across the given scopes, keyed
 * the same way (`${serverId}::${org}::${name}`). Callers are expected to
 * invoke this ONCE, only for the distinct (serverId,org) pairs actually
 * present in whatever result set they already have -- not an account's whole
 * reachable fleet -- and only the first time an attribute-based refinement is
 * actually used, caching the result thereafter.
 */
export async function loadCollectorNodeAttributes(
  scopes: ReadonlyArray<{ serverId: string; serverName: string; org: string }>,
  audit: CollectorAuditContext,
): Promise<NodeAttributesResult> {
  if (scopes.length === 0) return { attributesByKey: new Map(), failedScopes: [] };
  const { succeeded, failed, byCollectorId, serverNameOf } = await fetchRawNodesByScope(scopes, audit);

  const attributesByKey = new Map<string, unknown>();
  for (const outcome of succeeded) {
    const entry = byCollectorId.get(outcome.serverId); // outcome.serverId holds the collector's own id, see fetchRawNodesByScope
    if (!entry) continue;
    for (const serverId of entry.serverIds) {
      for (const n of outcome.data) {
        attributesByKey.set(`${serverId}::${n.Org}::${n.Name}`, n.Attributes ?? null);
      }
    }
  }

  return { attributesByKey, failedScopes: buildFailedScopes(failed, byCollectorId, serverNameOf) };
}
