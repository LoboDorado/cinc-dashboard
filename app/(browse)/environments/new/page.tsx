import { currentAccountId } from "@/lib/guard";
import { listReachableScopes, requireObjectAccessMany } from "@/lib/admin/access";
import { ScopedCreateForm } from "@/components/scoped-create-form";
import { createEnvironment } from "@/app/servers/[server]/orgs/[org]/environments/actions";

export default async function NewEnvironmentPage() {
  const accountId = await currentAccountId();
  const { scopes } = await listReachableScopes(accountId);
  const { contexts } = await requireObjectAccessMany(
    accountId,
    scopes.map(({ serverId, org }) => ({ serverId, org })),
    "environments",
    "write",
  );
  const serverNameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));
  const options = contexts.map(({ serverId, org }) => ({
    serverId,
    org,
    serverName: serverNameOf.get(serverId) ?? serverId,
  }));

  return <ScopedCreateForm kind="environment" listKind="environments" options={options} action={createEnvironment} />;
}
