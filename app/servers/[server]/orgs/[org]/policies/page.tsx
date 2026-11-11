import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { policies } from "@/lib/cinc/readonly";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { ResourceTable } from "@/components/resource-table";
import { EmptyState } from "@/components/empty-state";
import { CommandSnippet } from "@/components/command-snippet";
import { PoliciesIllustration } from "@/components/illustrations";

export default async function PoliciesPage({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  const accountId = await currentAccountId();
  const res = await safeGet(async () => {
    const ctx = await requireObjectAccess(accountId, server, org, "policies", "read");
    return policies.list(ctx);
  });
  if ("error" in res) {
    return <p className="text-sm text-danger">{explainRead(res.error)}</p>;
  }
  return (
    <ResourceTable
      title="Policies"
      names={Object.keys(res.data)}
      basePath={`/servers/${server}/orgs/${org}/policies`}
      empty={
        <EmptyState
          illustration={<PoliciesIllustration />}
          title="No policies yet"
          actions={
            <CommandSnippet
              commands={{
                cinc: ["cinc policy install", "cinc policy push GROUP"],
                knife: ["chef install", "chef push GROUP"],
              }}
              notes={{
                knife:
                  "knife has no Policyfile commands; these come with your workstation's Policyfile tooling.",
              }}
            />
          }
        >
          A Policyfile locks a node&apos;s run list and every cookbook version
          together. Push it from your workstation to a policy group.
        </EmptyState>
      }
    />
  );
}
