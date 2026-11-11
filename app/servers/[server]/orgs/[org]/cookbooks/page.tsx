import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { listCookbooks } from "@/lib/cinc/cookbooks";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { CookbooksTable } from "@/components/cookbooks-table";

export default async function CookbooksPage({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  const accountId = await currentAccountId();
  const res = await safeGet(async () => {
    const ctx = await requireObjectAccess(accountId, server, org, "cookbooks", "read");
    return listCookbooks(ctx);
  });
  if ("error" in res) {
    return <p className="text-sm text-danger">{explainRead(res.error)}</p>;
  }
  return (
    <CookbooksTable
      basePath={`/servers/${server}/orgs/${org}/cookbooks`}
      cookbooks={res.data}
    />
  );
}
