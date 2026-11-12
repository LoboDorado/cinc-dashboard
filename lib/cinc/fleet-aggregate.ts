import "server-only";
import { listReachableScopes, requireObjectAccessMany, type AuthorizedActionContext } from "../admin/access";
import { partitionScoped, type ScopedOutcome } from "./aggregate";
import { fetchFleetNodes } from "./search";
import { fetchFleetCounts, type FleetCounts } from "./fleet-counts";
import { getClientLifecycle } from "./client-lifecycle";
import { buildSnapshot, type FleetNode, type FleetStats, type NodeSummary } from "./fleet";
import { objectPath } from "../urls";

export type FailedScope = { serverName: string; org: string; reason: string };

type ResolvedScope = { serverId: string; serverName: string; org: string; ctx: AuthorizedActionContext };

/**
 * Mints every (server, org) context ONCE, shared by both the fast
 * (fetchAggregatedFleetCounts) and slow (loadAggregatedFleetSnapshot) tier of
 * the aggregated dashboard -- mirrors OrgDashboard's single requireObjectAccess
 * call, avoiding both tiers independently re-paying requireObjectAccessMany's
 * grants-load/server-decrypt cost.
 */
export async function resolveFleetAccess(
  accountId: string,
): Promise<{ contexts: ResolvedScope[]; failedScopes: FailedScope[] }> {
  const { scopes, unavailable } = await listReachableScopes(accountId);
  const failedScopes: FailedScope[] = unavailable.map((u) => ({
    serverName: u.serverName,
    org: "*",
    reason: u.reason,
  }));
  if (scopes.length === 0) return { contexts: [], failedScopes };

  const { contexts, denied } = await requireObjectAccessMany(
    accountId,
    scopes.map(({ serverId, org }) => ({ serverId, org })),
    "nodes",
    "read",
  );
  const nameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));
  for (const d of denied) {
    failedScopes.push({
      serverName: nameOf.get(d.serverId) ?? d.serverId,
      org: d.org,
      reason: "access denied",
    });
  }
  return {
    contexts: contexts.map((c) => ({ ...c, serverName: nameOf.get(c.serverId) ?? c.serverId })),
    failedScopes,
  };
}

/** Bounds how long one hung scope can hold up the whole sweep -- a shared
 *  aggregated page now pays for a slow origin server on every viewer's behalf,
 *  not just one account's, so it can't wait forever. Nothing in
 *  lib/cinc/client.ts has a timeout today; scoped narrowly here rather than
 *  changing that shared transport. Only bounds the dashboard's own wait, not
 *  the load placed on the slow server (Promise.race doesn't cancel the fetch). */
const PER_SCOPE_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("scope timed out")), ms);
    }),
  ]);
}

function explainScopeError(e: unknown): string {
  return e instanceof Error && e.message === "scope timed out" ? "timed out" : "unreachable";
}

export type AggregatedNode = NodeSummary & { serverId: string; server: string; org: string; href: string };
export type AggregatedFleetSnapshot = { stats: FleetStats; nodes: AggregatedNode[]; generatedAt: number };

type Origin = { serverId: string; serverName: string; org: string };

/**
 * Fans fetchFleetNodes out across every given context, tags each resulting
 * node with its origin, classifies the WHOLE merged fleet in one buildSnapshot
 * call (not once per scope), and un-tags the result into AggregatedNode[].
 *
 * Classifying once over the merged set isn't just simpler than summing
 * per-scope stats -- it's more correct: when the client-lifecycle source is
 * unavailable, buildSnapshot falls back to the newest version within whatever
 * array it's given. Classifying org A and org B separately could let org A's
 * older fleet read "current" against its own local ceiling while a newer
 * fleet exists in org B; classifying the merge once applies one fleet-wide bar.
 */
export async function loadAggregatedFleetSnapshot(
  contexts: ResolvedScope[],
  nowMs: number,
): Promise<{ snapshot: AggregatedFleetSnapshot; failedScopes: FailedScope[] }> {
  const [fleetOutcomes, lifecycle] = await Promise.all([
    Promise.all(
      contexts.map(async ({ serverId, serverName, org, ctx }): Promise<ScopedOutcome<FleetNode[]>> => {
        try {
          const nodes = await withTimeout(fetchFleetNodes(ctx), PER_SCOPE_TIMEOUT_MS);
          return { serverId, serverName, org, ok: true, data: nodes };
        } catch (e) {
          return { serverId, serverName, org, ok: false, error: explainScopeError(e) };
        }
      }),
    ),
    getClientLifecycle(nowMs), // server/org-independent -- fetched exactly once for the whole sweep
  ]);

  const { succeeded, failed } = partitionScoped(fleetOutcomes);
  const failedScopes: FailedScope[] = failed.map((f) => ({
    serverName: f.serverName,
    org: f.org,
    reason: f.error,
  }));

  const tagged: FleetNode[] = succeeded.flatMap(({ serverId, serverName, org, data }) =>
    data.map((n) => ({ ...n, tag: { serverId, serverName, org } satisfies Origin })),
  );

  const raw = buildSnapshot(tagged, nowMs, lifecycle);
  const nodes: AggregatedNode[] = raw.nodes.map((n) => {
    const { serverId, serverName, org } = n.tag as Origin;
    return {
      name: n.name,
      status: n.status,
      missing: n.missing,
      unconfigured: n.unconfigured,
      emptyRunList: n.emptyRunList,
      defaultEnv: n.defaultEnv,
      recent: n.recent,
      lastCheckIn: n.lastCheckIn,
      chefVersion: n.chefVersion,
      clientStatus: n.clientStatus,
      environment: n.environment,
      platform: n.platform,
      platformVersion: n.platformVersion,
      policyGroup: n.policyGroup,
      serverId,
      server: serverName,
      org,
      href: objectPath(serverId, org, "nodes", n.name),
    };
  });

  return { snapshot: { stats: raw.stats, nodes, generatedAt: raw.generatedAt }, failedScopes };
}

/**
 * Fans the cheap fetchFleetCounts preview out across every given context and
 * sums only the scopes that answered -- never zero-fills a failed scope's
 * contribution (that would make a partial count look confidently complete).
 * Degrades the WHOLE result to null, the same way fetchFleetCounts itself
 * does on a single scope, only when every scope fails or none are reachable
 * -- an empty sum would otherwise misleadingly read as "0 missing".
 */
export async function fetchAggregatedFleetCounts(
  contexts: ResolvedScope[],
  nowMs: number,
): Promise<{ counts: FleetCounts; failedScopes: FailedScope[] }> {
  const outcomes: ScopedOutcome<FleetCounts>[] = await Promise.all(
    contexts.map(async ({ serverId, serverName, org, ctx }): Promise<ScopedOutcome<FleetCounts>> => {
      const c = await fetchFleetCounts(ctx, nowMs); // never rejects -- degrades to nulls internally
      if (c.recent === null) {
        return { serverId, serverName, org, ok: false, error: "counts unavailable" };
      }
      return { serverId, serverName, org, ok: true, data: c };
    }),
  );
  const { succeeded, failed } = partitionScoped(outcomes);

  const counts: FleetCounts =
    succeeded.length === 0
      ? { recent: null, missing: null, unconfigured: null }
      : succeeded.reduce(
          (acc, s) => ({
            recent: (acc.recent ?? 0) + (s.data.recent ?? 0),
            missing: (acc.missing ?? 0) + (s.data.missing ?? 0),
            unconfigured: (acc.unconfigured ?? 0) + (s.data.unconfigured ?? 0),
          }),
          { recent: 0, missing: 0, unconfigured: 0 } as FleetCounts,
        );

  return {
    counts,
    failedScopes: failed.map((f) => ({ serverName: f.serverName, org: f.org, reason: f.error })),
  };
}
