import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { clients } from "@/lib/cinc/readonly";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { ObjectEditor } from "@/components/object-editor";
import { ClientDetails } from "@/components/details/client-details";
import { deleteClientAction } from "../actions";

export default async function ClientDetail({
  params,
}: {
  params: Promise<{ server: string; org: string; name: string }>;
}) {
  const { server, org, name: raw } = await params;
  const name = decodeURIComponent(raw);
  const accountId = await currentAccountId();
  const res = await safeGet(async () => {
    const ctx = await requireObjectAccess(accountId, server, org, "clients", "read");
    return clients.get(ctx, name);
  });
  if ("error" in res) {
    return <p className="text-sm text-danger">{explainRead(res.error)}</p>;
  }
  return (
    <ObjectEditor
      name={name}
      initialJson={JSON.stringify(res.data, null, 2)}
      details={<ClientDetails data={res.data} />}
      backHref={`/servers/${server}/orgs/${org}/clients`}
      readOnly={true}
      onDelete={deleteClientAction.bind(null, server, org, name)}
    />
  );
}
