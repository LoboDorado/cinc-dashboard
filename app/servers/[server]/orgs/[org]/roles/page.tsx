import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { buttonClass } from "@/components/ui/button";
import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { makeResource } from "@/lib/cinc/resource";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { ResourceTable } from "@/components/resource-table";
import { RolesIllustration } from "@/components/illustrations";

const roles = makeResource("roles");

export default async function RolesPage({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  const accountId = await currentAccountId();
  const base = `/servers/${server}/orgs/${org}/roles`;
  const res = await safeGet(async () => {
    const ctx = await requireObjectAccess(accountId, server, org, "roles", "read");
    return roles.list(ctx);
  });
  if ("error" in res) {
    return <p className="text-sm text-danger">{explainRead(res.error)}</p>;
  }
  return (
    <ResourceTable
      title="Roles"
      names={Object.keys(res.data)}
      basePath={base}
      createHref={`${base}/new`}
      empty={
        <EmptyState
          illustration={<RolesIllustration />}
          title="No roles yet"
          actions={
            <Link href={`${base}/new`} className={buttonClass()}>
              New role
            </Link>
          }
        >
          A role bundles recipes and attributes into one reusable run list you
          can give to many nodes.
        </EmptyState>
      }
    />
  );
}
