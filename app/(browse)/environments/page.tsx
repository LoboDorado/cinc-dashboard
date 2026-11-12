import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { buttonClass } from "@/components/ui/button";
import { currentAccountId } from "@/lib/guard";
import { listReachableScopes, requireObjectAccessMany } from "@/lib/admin/access";
import { makeResource } from "@/lib/cinc/resource";
import { partitionScoped, type ScopedOutcome } from "@/lib/cinc/aggregate";
import { ResourceTable, type ResourceRow } from "@/components/resource-table";
import { EnvironmentsIllustration } from "@/components/illustrations";
import { objectPath, newPath } from "@/lib/urls";

const environments = makeResource("environments");

export default async function EnvironmentsPage() {
  const accountId = await currentAccountId();
  const { scopes, unavailable } = await listReachableScopes(accountId);
  const { contexts } = await requireObjectAccessMany(
    accountId,
    scopes.map(({ serverId, org }) => ({ serverId, org })),
    "environments",
    "read",
  );
  const serverNameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));

  const outcomes: ScopedOutcome<Record<string, string>>[] = await Promise.all(
    contexts.map(async ({ serverId, org, ctx }): Promise<ScopedOutcome<Record<string, string>>> => {
      const serverName = serverNameOf.get(serverId) ?? serverId;
      try {
        return { serverId, serverName, org, ok: true, data: await environments.list(ctx) };
      } catch {
        return { serverId, serverName, org, ok: false, error: "couldn't load environments" };
      }
    }),
  );
  const { succeeded, failed } = partitionScoped(outcomes);

  const rows: ResourceRow[] = succeeded.flatMap(({ serverId, serverName, org, data }) =>
    Object.keys(data).map((name) => ({
      name,
      server: serverName,
      org,
      href: objectPath(serverId, org, "environments", name),
      builtIn: name === "_default",
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
        title="Environments"
        rows={rows}
        createHref={newPath("environments")}
        empty={
          <EmptyState
            illustration={<EnvironmentsIllustration />}
            title={
              rows.length === 0 ? (
                "No environments yet"
              ) : (
                <>
                  Just <code className="font-mono">_default</code> so far
                </>
              )
            }
            actions={
              <>
                <Link href={newPath("environments")} className={buttonClass()}>
                  New environment
                </Link>
                {rows.map((r) => (
                  <Link key={r.href} href={r.href} className="text-sm text-link hover:underline">
                    View <span className="font-mono">_default</span>
                    {r.org && ` in ${r.org}`}
                  </Link>
                ))}
              </>
            }
          >
            Environments pin cookbook versions and set attributes per stage, such
            as dev, staging and prod. Every node starts in{" "}
            <code className="font-mono">_default</code>.
          </EmptyState>
        }
      />
    </div>
  );
}
