import { currentAccountId } from "@/lib/guard";
import { listReachableScopes, requireObjectAccessMany } from "@/lib/admin/access";
import { ScopedCreateForm } from "@/components/scoped-create-form";
import { createRole } from "@/app/servers/[server]/orgs/[org]/roles/actions";

export default async function NewRolePage() {
  const accountId = await currentAccountId();
  const { scopes } = await listReachableScopes(accountId);
  const { contexts } = await requireObjectAccessMany(
    accountId,
    scopes.map(({ serverId, org }) => ({ serverId, org })),
    "roles",
    "write",
  );
  const serverNameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));
  const options = contexts.map(({ serverId, org }) => ({
    serverId,
    org,
    serverName: serverNameOf.get(serverId) ?? serverId,
  }));

  return <ScopedCreateForm kind="role" listKind="roles" options={options} action={createRole} />;
}
