import { currentAccountId } from "@/lib/guard";
import { listReachableScopes, requireObjectAccessMany } from "@/lib/admin/access";
import { ScopedNewObjectForm } from "@/components/scoped-new-object-form";
import { createNode } from "@/app/servers/[server]/orgs/[org]/nodes/actions";

export default async function NewNodePage() {
  const accountId = await currentAccountId();
  const { scopes } = await listReachableScopes(accountId);
  const { contexts } = await requireObjectAccessMany(
    accountId,
    scopes.map(({ serverId, org }) => ({ serverId, org })),
    "nodes",
    "write",
  );
  const serverNameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));
  const options = contexts.map(({ serverId, org }) => ({
    serverId,
    org,
    serverName: serverNameOf.get(serverId) ?? serverId,
  }));
  const initialJson = JSON.stringify(
    { name: "", chef_environment: "_default", run_list: [], normal: {} },
    null,
    2,
  );

  return (
    <ScopedNewObjectForm
      title="New node"
      kindLabel="node"
      listKind="nodes"
      initialJson={initialJson}
      nameKind="node"
      options={options}
      action={createNode}
    />
  );
}
