import { currentAccountId } from "@/lib/guard";
import { listReachableScopes, requireObjectAccessMany } from "@/lib/admin/access";
import { ScopedNewBagForm } from "@/components/scoped-new-bag-form";
import { createBag } from "@/app/servers/[server]/orgs/[org]/data_bags/actions";

export default async function NewDataBagPage() {
  const accountId = await currentAccountId();
  const { scopes } = await listReachableScopes(accountId);
  const { contexts } = await requireObjectAccessMany(
    accountId,
    scopes.map(({ serverId, org }) => ({ serverId, org })),
    "data_bags",
    "write",
  );
  const serverNameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));
  const options = contexts.map(({ serverId, org }) => ({
    serverId,
    org,
    serverName: serverNameOf.get(serverId) ?? serverId,
  }));

  return <ScopedNewBagForm options={options} action={createBag} />;
}
