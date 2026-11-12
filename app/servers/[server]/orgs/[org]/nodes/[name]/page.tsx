import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { getCollectorsForServer } from "@/lib/admin/collectors";
import { makeResource } from "@/lib/cinc/resource";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { ObjectEditor } from "@/components/object-editor";
import { NodeDetailTabs } from "@/components/node-detail-tabs";
import { NodeDetails, nodePlatform } from "@/components/details/node-details";
import { PlatformIcon } from "@/components/platform/platform-icon";
import { getClientLifecycle } from "@/lib/cinc/client-lifecycle";
import { versionStatus } from "@/lib/cinc/fleet";
import { nowMs } from "@/lib/cinc/client";
import { listPath } from "@/lib/urls";
import { saveNode, deleteNode } from "../actions";

const nodes = makeResource("nodes");

/** Pull automatic.chef_packages.chef.version off a fetched node object. */
function nodeClientVersion(data: unknown): string | null {
  const rec = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const version = rec(rec(rec(rec(data).automatic).chef_packages).chef).version;
  return typeof version === "string" ? version : null;
}

export default async function NodeDetail({
  params,
}: {
  params: Promise<{ server: string; org: string; name: string }>;
}) {
  const { server, org, name: raw } = await params;
  const name = decodeURIComponent(raw);
  const accountId = await currentAccountId();

  const ctxRes = await safeGet(() => requireObjectAccess(accountId, server, org, "nodes", "read"));
  if ("error" in ctxRes) {
    return <p className="text-sm text-danger">{explainRead(ctxRes.error)}</p>;
  }
  const ctx = ctxRes.data;

  // Fetch the node, the client lifecycle, and which collectors (if any) cover
  // this server in parallel. The lifecycle and collector lookup both degrade
  // to their own "unavailable"/"none" state on their own, so neither blocks
  // the node. The collector lookup is a cheap indexed join, not a network
  // call -- it only decides the Compliance tab's CTA-vs-content state.
  const [res, lifecycle, collectors] = await Promise.all([
    safeGet(() => nodes.get(ctx, name)),
    getClientLifecycle(nowMs()),
    getCollectorsForServer(ctx.serverId),
  ]);
  if ("error" in res) {
    return <p className="text-sm text-danger">{explainRead(res.error)}</p>;
  }

  // No fleet baseline on a single node, so pass null fallback: with the
  // lifecycle present we still get EOL and major-behind; without it, no warning.
  const clientStatus = versionStatus(
    nodeClientVersion(res.data),
    lifecycle,
    null,
  );

  return (
    <NodeDetailTabs
      detailsPanel={
        <ObjectEditor
          name={name}
          titleIcon={
            <PlatformIcon
              platform={nodePlatform(res.data)}
              className="h-5 w-5 text-muted"
            />
          }
          initialJson={JSON.stringify(res.data, null, 2)}
          details={
            <NodeDetails
              data={res.data}
              clientStatus={clientStatus}
              onSaveRunList={saveNode.bind(null, server, org, name)}
              onSaveTags={saveNode.bind(null, server, org, name)}
            />
          }
          backHref={listPath("nodes")}
          onSave={saveNode.bind(null, server, org, name)}
          onDelete={deleteNode.bind(null, server, org, name)}
        />
      }
      hasCollector={collectors.length > 0}
      server={server}
      org={org}
      nodeName={name}
    />
  );
}
