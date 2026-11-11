import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { buttonClass } from "@/components/ui/button";
import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { dataBags } from "@/lib/cinc/databags";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { ResourceTable } from "@/components/resource-table";
import { DataBagsIllustration } from "@/components/illustrations";

export default async function DataBagsPage({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  const accountId = await currentAccountId();
  const base = `/servers/${server}/orgs/${org}/data_bags`;
  const res = await safeGet(async () => {
    const ctx = await requireObjectAccess(accountId, server, org, "data_bags", "read");
    return dataBags.list(ctx);
  });
  if ("error" in res) {
    return <p className="text-sm text-danger">{explainRead(res.error)}</p>;
  }
  return (
    <ResourceTable
      title="Data Bags"
      names={Object.keys(res.data)}
      basePath={base}
      createHref={`${base}/new`}
      empty={
        <EmptyState
          illustration={<DataBagsIllustration />}
          title="No data bags yet"
          actions={
            <Link href={`${base}/new`} className={buttonClass()}>
              New data bag
            </Link>
          }
        >
          Data bags hold global JSON your recipes can read, such as user
          lists, settings and encrypted secrets.
        </EmptyState>
      }
    />
  );
}
