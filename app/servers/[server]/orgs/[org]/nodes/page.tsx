import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { loadFleetSnapshot } from "@/lib/cinc/fleet-snapshot";
import { nowMs } from "@/lib/cinc/client";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { NodesTable } from "@/components/nodes-table";

export default async function NodesPage({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  const accountId = await currentAccountId();
  const base = `/servers/${server}/orgs/${org}/nodes`;

  // The fleet snapshot (the same search that powers the dashboard) carries each
  // node's last check-in and client version, so the list can show those columns
  // without an N+1 fetch. It needs node *search* permission, not just *list*.
  const ctxRes = await safeGet(() => requireObjectAccess(accountId, server, org, "nodes", "read"));
  if ("error" in ctxRes) {
    return <p className="text-sm text-danger">{explainRead(ctxRes.error)}</p>;
  }

  const res = await loadFleetSnapshot(ctxRes.data, nowMs());
  if ("error" in res) {
    return <p className="text-sm text-danger">{explainRead(res.error)}</p>;
  }
  return (
    <NodesTable
      basePath={base}
      createHref={`${base}/new`}
      nodes={res.data.nodes}
      generatedAt={res.data.generatedAt}
    />
  );
}
