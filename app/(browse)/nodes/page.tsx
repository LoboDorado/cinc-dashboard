import { currentAccountId } from "@/lib/guard";
import { listReachableScopes, requireObjectAccessMany } from "@/lib/admin/access";
import { loadFleetSnapshot } from "@/lib/cinc/fleet-snapshot";
import { loadCollectorNodeFields } from "@/lib/collector/node-fields";
import { nowMs } from "@/lib/cinc/client";
import { partitionScoped, type ScopedOutcome } from "@/lib/cinc/aggregate";
import { NodesTable, type NodeRow } from "@/components/nodes-table";
import type { FleetSnapshot } from "@/lib/cinc/fleet";
import { objectPath, newPath } from "@/lib/urls";

export default async function NodesPage() {
  const accountId = await currentAccountId();
  const { scopes, unavailable } = await listReachableScopes(accountId);
  const { contexts } = await requireObjectAccessMany(
    accountId,
    scopes.map(({ serverId, org }) => ({ serverId, org })),
    "nodes",
    "read",
  );
  const serverNameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));
  const now = nowMs();

  // The node fetch and the collector-field lookup run in the same tier: the
  // facet <select>s need lastCCRStatus synchronously at first paint, the
  // same as the existing free-text box, so it can't be deferred the way the
  // Compliance tab's lazy fetch is.
  const [outcomes, collectorResult] = await Promise.all([
    Promise.all(
      contexts.map(async ({ serverId, org, ctx }): Promise<ScopedOutcome<FleetSnapshot>> => {
        const serverName = serverNameOf.get(serverId) ?? serverId;
        const res = await loadFleetSnapshot(ctx, now);
        if ("error" in res) {
          return { serverId, serverName, org, ok: false, error: "couldn't load nodes" };
        }
        return { serverId, serverName, org, ok: true, data: res.data };
      }),
    ),
    contexts.length === 0
      ? Promise.resolve({ fields: new Map(), failedScopes: [] })
      : loadCollectorNodeFields(
          contexts.map(({ serverId, org }) => ({
            serverId,
            serverName: serverNameOf.get(serverId) ?? serverId,
            org,
          })),
          { accountId: contexts[0].ctx.accountId, onBehalfOf: contexts[0].ctx.onBehalfOf },
        ),
  ]);
  const { succeeded, failed } = partitionScoped(outcomes);

  const nodes: NodeRow[] = succeeded.flatMap(({ serverId, serverName, org, data }) =>
    data.nodes.map((n) => ({
      ...n,
      server: serverName,
      org,
      href: objectPath(serverId, org, "nodes", n.name),
      lastCCRStatus: collectorResult.fields.get(`${serverId}::${org}::${n.name}`)?.lastCCRStatus,
    })),
  );

  const failedScopes = [
    ...unavailable.map((u) => `${u.serverName} (${u.reason})`),
    ...failed.map((f) => `${f.serverName} / ${f.org}`),
  ];

  return (
    <div className="space-y-4">
      {failedScopes.length > 0 && (
        <p role="alert" className="text-sm text-warn">
          Couldn&apos;t load {failedScopes.length} scope{failedScopes.length === 1 ? "" : "s"}:{" "}
          {failedScopes.join("; ")}
        </p>
      )}
      {collectorResult.failedScopes.length > 0 && (
        // Separate, lower-severity than the banner above: that one means
        // nodes are entirely missing. This only means the Converge-status
        // facet is missing data for some otherwise-fully-present nodes.
        <p role="alert" className="text-sm text-muted">
          Couldn&apos;t reach the collector for {collectorResult.failedScopes.length} server
          {collectorResult.failedScopes.length === 1 ? "" : "s"} (
          {collectorResult.failedScopes.map((f) => f.serverName).join(", ")}) — converge status
          is unavailable there for now.
        </p>
      )}
      <NodesTable createHref={newPath("nodes")} nodes={nodes} generatedAt={now} />
    </div>
  );
}
