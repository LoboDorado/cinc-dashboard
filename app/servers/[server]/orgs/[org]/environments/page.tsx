import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { buttonClass } from "@/components/ui/button";
import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { makeResource } from "@/lib/cinc/resource";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { ResourceTable } from "@/components/resource-table";
import { EnvironmentsIllustration } from "@/components/illustrations";

const environments = makeResource("environments");

export default async function EnvironmentsPage({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  const accountId = await currentAccountId();
  const base = `/servers/${server}/orgs/${org}/environments`;
  const res = await safeGet(async () => {
    const ctx = await requireObjectAccess(accountId, server, org, "environments", "read");
    return environments.list(ctx);
  });
  if ("error" in res) {
    return <p className="text-sm text-danger">{explainRead(res.error)}</p>;
  }
  const names = Object.keys(res.data);
  return (
    <ResourceTable
      title="Environments"
      names={names}
      basePath={base}
      createHref={`${base}/new`}
      builtIn={["_default"]}
      empty={
        <EmptyState
          illustration={<EnvironmentsIllustration />}
          title={
            names.length === 0 ? (
              "No environments yet"
            ) : (
              <>
                Just <code className="font-mono">_default</code> so far
              </>
            )
          }
          actions={
            <>
              <Link href={`${base}/new`} className={buttonClass()}>
                New environment
              </Link>
              {names.length > 0 && (
                <Link href={`${base}/_default`} className="text-sm text-link hover:underline">
                  View <span className="font-mono">_default</span>
                </Link>
              )}
            </>
          }
        >
          Environments pin cookbook versions and set attributes per stage, such
          as dev, staging and prod. Every node starts in{" "}
          <code className="font-mono">_default</code>.
        </EmptyState>
      }
    />
  );
}
