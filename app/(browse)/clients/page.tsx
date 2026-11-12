import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { buttonClass } from "@/components/ui/button";
import { currentAccountId } from "@/lib/guard";
import { listReachableScopes, requireObjectAccessMany } from "@/lib/admin/access";
import { clients } from "@/lib/cinc/readonly";
import { partitionScoped, type ScopedOutcome } from "@/lib/cinc/aggregate";
import { ResourceTable, type ResourceRow } from "@/components/resource-table";
import { ClientsIllustration } from "@/components/illustrations";
import { objectPath, newPath } from "@/lib/urls";

export default async function ClientsPage() {
  const accountId = await currentAccountId();
  const { scopes, unavailable } = await listReachableScopes(accountId);
  const { contexts } = await requireObjectAccessMany(
    accountId,
    scopes.map(({ serverId, org }) => ({ serverId, org })),
    "clients",
    "read",
  );
  const serverNameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));

  const outcomes: ScopedOutcome<Record<string, unknown>>[] = await Promise.all(
    contexts.map(async ({ serverId, org, ctx }): Promise<ScopedOutcome<Record<string, unknown>>> => {
      const serverName = serverNameOf.get(serverId) ?? serverId;
      try {
        return { serverId, serverName, org, ok: true, data: await clients.list(ctx) };
      } catch {
        return { serverId, serverName, org, ok: false, error: "couldn't load clients" };
      }
    }),
  );
  const { succeeded, failed } = partitionScoped(outcomes);

  const rows: ResourceRow[] = succeeded.flatMap(({ serverId, serverName, org, data }) =>
    Object.keys(data).map((name) => ({
      name,
      server: serverName,
      org,
      href: objectPath(serverId, org, "clients", name),
      builtIn: name === `${org}-validator`,
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
        title="Clients"
        rows={rows}
        createHref={newPath("clients")}
        empty={
          <EmptyState
            illustration={<ClientsIllustration />}
            title={rows.length === 0 ? "No clients yet" : "Only each org's own validator so far"}
            actions={
              <>
                <Link href={newPath("clients")} className={buttonClass()}>
                  New client
                </Link>
                {rows.map((r) => (
                  <Link key={r.href} href={r.href} className="text-sm text-link hover:underline">
                    View <span className="font-mono">{r.name}</span>
                  </Link>
                ))}
              </>
            }
          >
            Clients are API identities. Each node gets its own when it&apos;s
            bootstrapped; create one for CI jobs or scripts.
          </EmptyState>
        }
      />
    </div>
  );
}
