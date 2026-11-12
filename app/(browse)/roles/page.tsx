import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { buttonClass } from "@/components/ui/button";
import { currentAccountId } from "@/lib/guard";
import { listReachableScopes, requireObjectAccessMany } from "@/lib/admin/access";
import { makeResource } from "@/lib/cinc/resource";
import { partitionScoped, type ScopedOutcome } from "@/lib/cinc/aggregate";
import { ResourceTable, type ResourceRow } from "@/components/resource-table";
import { RolesIllustration } from "@/components/illustrations";
import { objectPath, newPath } from "@/lib/urls";

const roles = makeResource("roles");

export default async function RolesPage() {
  const accountId = await currentAccountId();
  const { scopes, unavailable } = await listReachableScopes(accountId);
  const { contexts } = await requireObjectAccessMany(
    accountId,
    scopes.map(({ serverId, org }) => ({ serverId, org })),
    "roles",
    "read",
  );
  const serverNameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));

  const outcomes: ScopedOutcome<Record<string, string>>[] = await Promise.all(
    contexts.map(async ({ serverId, org, ctx }): Promise<ScopedOutcome<Record<string, string>>> => {
      const serverName = serverNameOf.get(serverId) ?? serverId;
      try {
        return { serverId, serverName, org, ok: true, data: await roles.list(ctx) };
      } catch {
        return { serverId, serverName, org, ok: false, error: "couldn't load roles" };
      }
    }),
  );
  const { succeeded, failed } = partitionScoped(outcomes);

  const rows: ResourceRow[] = succeeded.flatMap(({ serverId, serverName, org, data }) =>
    Object.keys(data).map((name) => ({
      name,
      server: serverName,
      org,
      href: objectPath(serverId, org, "roles", name),
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
        title="Roles"
        rows={rows}
        createHref={newPath("roles")}
        empty={
          <EmptyState
            illustration={<RolesIllustration />}
            title="No roles yet"
            actions={
              <Link href={newPath("roles")} className={buttonClass()}>
                New role
              </Link>
            }
          >
            A role bundles recipes and attributes into one reusable run list you
            can give to many nodes.
          </EmptyState>
        }
      />
    </div>
  );
}
