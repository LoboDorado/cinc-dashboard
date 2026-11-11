import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { dataBags } from "@/lib/cinc/databags";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { ObjectEditor } from "@/components/object-editor";
import { DataBagItemDetails } from "@/components/details/data-bag-item-details";
import { saveItem, deleteItem } from "../../actions";

export default async function DataBagItemDetail({
  params,
}: {
  params: Promise<{ server: string; org: string; bag: string; id: string }>;
}) {
  const { server, org, bag: rawBag, id: rawId } = await params;
  const bag = decodeURIComponent(rawBag);
  const id = decodeURIComponent(rawId);
  const accountId = await currentAccountId();
  const base = `/servers/${server}/orgs/${org}/data_bags/${bag}`;
  const res = await safeGet(async () => {
    const ctx = await requireObjectAccess(accountId, server, org, "data_bags", "read");
    return dataBags.getItem(ctx, bag, id);
  });
  if ("error" in res) {
    return <p className="text-sm text-danger">{explainRead(res.error)}</p>;
  }
  return (
    <ObjectEditor
      name={id}
      initialJson={JSON.stringify(res.data, null, 2)}
      details={<DataBagItemDetails data={res.data} />}
      backHref={base}
      onSave={saveItem.bind(null, server, org, bag, id)}
      onDelete={deleteItem.bind(null, server, org, bag, id)}
    />
  );
}
