import Link from "next/link";
import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { dataBags } from "@/lib/cinc/databags";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { ResourceTable } from "@/components/resource-table";
import { EmptyState } from "@/components/empty-state";
import { DataBagsIllustration } from "@/components/illustrations";
import { buttonClass } from "@/components/ui/button";
import { DeleteBagButton } from "./delete-bag-button";
import { deleteBag } from "../actions";

export default async function DataBagItemsPage({
  params,
}: {
  params: Promise<{ server: string; org: string; bag: string }>;
}) {
  const { server, org, bag: raw } = await params;
  const bag = decodeURIComponent(raw);
  const accountId = await currentAccountId();
  const base = `/servers/${server}/orgs/${org}/data_bags/${bag}`;
  const res = await safeGet(async () => {
    const ctx = await requireObjectAccess(accountId, server, org, "data_bags", "read");
    return dataBags.listItems(ctx, bag);
  });
  if ("error" in res) {
    return <p className="text-sm text-danger">{explainRead(res.error)}</p>;
  }
  const items = Object.keys(res.data);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/servers/${server}/orgs/${org}/data_bags`}
          className="text-sm text-muted hover:text-text"
        >
          ← back
        </Link>
        <DeleteBagButton
          server={server}
          org={org}
          bag={bag}
          itemCount={items.length}
          onDelete={deleteBag.bind(null, server, org, bag)}
        />
      </div>
      <ResourceTable
        title={bag}
        names={items}
        basePath={base}
        createHref={`${base}/new`}
        empty={
          <EmptyState
            illustration={<DataBagsIllustration />}
            title="This data bag is empty"
            actions={
              <Link href={`${base}/new`} className={buttonClass()}>
                New item
              </Link>
            }
          >
            Each item is a JSON document with an{" "}
            <code className="font-mono">id</code> that recipes look up by bag
            and item name.
          </EmptyState>
        }
      />
    </div>
  );
}
