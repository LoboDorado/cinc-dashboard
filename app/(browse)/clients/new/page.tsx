import { currentAccountId } from "@/lib/guard";
import { listReachableScopes, requireObjectAccessMany } from "@/lib/admin/access";
import { ScopedNewClientForm } from "@/components/scoped-new-client-form";
import { createClientAction } from "@/app/servers/[server]/orgs/[org]/clients/actions";

export default async function NewClientPage() {
  const accountId = await currentAccountId();
  const { scopes } = await listReachableScopes(accountId);
  const { contexts } = await requireObjectAccessMany(
    accountId,
    scopes.map(({ serverId, org }) => ({ serverId, org })),
    "clients",
    "write",
  );
  const serverNameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));
  const options = contexts.map(({ serverId, org }) => ({
    serverId,
    org,
    serverName: serverNameOf.get(serverId) ?? serverId,
  }));

  return <ScopedNewClientForm options={options} action={createClientAction} />;
}
