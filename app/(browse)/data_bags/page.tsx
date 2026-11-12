import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { buttonClass } from "@/components/ui/button";
import { currentAccountId } from "@/lib/guard";
import { listReachableScopes, requireObjectAccessMany } from "@/lib/admin/access";
import { dataBags } from "@/lib/cinc/databags";
import { partitionScoped, type ScopedOutcome } from "@/lib/cinc/aggregate";
import { ResourceTable, type ResourceRow } from "@/components/resource-table";
import { DataBagsIllustration } from "@/components/illustrations";
import { objectPath, newPath } from "@/lib/urls";

export default async function DataBagsPage() {
  const accountId = await currentAccountId();
  const { scopes, unavailable } = await listReachableScopes(accountId);
  const { contexts } = await requireObjectAccessMany(
    accountId,
    scopes.map(({ serverId, org }) => ({ serverId, org })),
    "data_bags",
    "read",
  );
  const serverNameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));

  const outcomes: ScopedOutcome<Record<string, string>>[] = await Promise.all(
    contexts.map(async ({ serverId, org, ctx }): Promise<ScopedOutcome<Record<string, string>>> => {
      const serverName = serverNameOf.get(serverId) ?? serverId;
      try {
        return { serverId, serverName, org, ok: true, data: await dataBags.list(ctx) };
      } catch {
        return { serverId, serverName, org, ok: false, error: "couldn't load data bags" };
      }
    }),
  );
  const { succeeded, failed } = partitionScoped(outcomes);

  const rows: ResourceRow[] = succeeded.flatMap(({ serverId, serverName, org, data }) =>
    Object.keys(data).map((name) => ({
      name,
      server: serverName,
      org,
      href: objectPath(serverId, org, "data_bags", name),
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
        title="Data Bags"
        rows={rows}
        createHref={newPath("data_bags")}
        empty={
          <EmptyState
            illustration={<DataBagsIllustration />}
            title="No data bags yet"
            actions={
              <Link href={newPath("data_bags")} className={buttonClass()}>
                New data bag
              </Link>
            }
          >
            Data bags hold global JSON your recipes can read, such as user
            lists, settings and encrypted secrets.
          </EmptyState>
        }
      />
    </div>
  );
}
