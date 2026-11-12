import { EmptyState } from "@/components/empty-state";
import { CommandSnippet } from "@/components/command-snippet";
import { PoliciesIllustration } from "@/components/illustrations";
import { currentAccountId } from "@/lib/guard";
import { listReachableScopes, requireObjectAccessMany } from "@/lib/admin/access";
import { policies } from "@/lib/cinc/readonly";
import { partitionScoped, type ScopedOutcome } from "@/lib/cinc/aggregate";
import { ResourceTable, type ResourceRow } from "@/components/resource-table";
import { objectPath } from "@/lib/urls";

export default async function PoliciesPage() {
  const accountId = await currentAccountId();
  const { scopes, unavailable } = await listReachableScopes(accountId);
  const { contexts } = await requireObjectAccessMany(
    accountId,
    scopes.map(({ serverId, org }) => ({ serverId, org })),
    "policies",
    "read",
  );
  const serverNameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));

  const outcomes: ScopedOutcome<Record<string, unknown>>[] = await Promise.all(
    contexts.map(async ({ serverId, org, ctx }): Promise<ScopedOutcome<Record<string, unknown>>> => {
      const serverName = serverNameOf.get(serverId) ?? serverId;
      try {
        return { serverId, serverName, org, ok: true, data: await policies.list(ctx) };
      } catch {
        return { serverId, serverName, org, ok: false, error: "couldn't load policies" };
      }
    }),
  );
  const { succeeded, failed } = partitionScoped(outcomes);

  const rows: ResourceRow[] = succeeded.flatMap(({ serverId, serverName, org, data }) =>
    Object.keys(data).map((name) => ({
      name,
      server: serverName,
      org,
      href: objectPath(serverId, org, "policies", name),
    })),
  );

  const failedScopes = [
    ...unavailable.map((u) => `${u.serverName} (${u.reason})`),
    ...failed.map((f) => `${f.serverName} / ${f.org}`),
  ];

  return (
    <div className="space-y-4">
      {failedScopes.length > 0 && (
        <p role="alert" className="text-sm text-warn">
          Couldn&apos;t load {failedScopes.length} scope{failedScopes.length === 1 ? "" : "s"}:{" "}
          {failedScopes.join("; ")}
        </p>
      )}
      <ResourceTable
        title="Policies"
        rows={rows}
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
    </div>
  );
}
