import { currentAccountId } from "@/lib/guard";
import { listReachableScopes, requireObjectAccessMany } from "@/lib/admin/access";
import { listCookbooks, type CookbookSummary } from "@/lib/cinc/cookbooks";
import { partitionScoped, type ScopedOutcome } from "@/lib/cinc/aggregate";
import { CookbooksTable, type CookbookRow } from "@/components/cookbooks-table";
import { objectPath } from "@/lib/urls";

export default async function CookbooksPage() {
  const accountId = await currentAccountId();
  const { scopes, unavailable } = await listReachableScopes(accountId);
  const { contexts } = await requireObjectAccessMany(
    accountId,
    scopes.map(({ serverId, org }) => ({ serverId, org })),
    "cookbooks",
    "read",
  );
  const serverNameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));

  const outcomes: ScopedOutcome<CookbookSummary[]>[] = await Promise.all(
    contexts.map(async ({ serverId, org, ctx }): Promise<ScopedOutcome<CookbookSummary[]>> => {
      const serverName = serverNameOf.get(serverId) ?? serverId;
      try {
        return { serverId, serverName, org, ok: true, data: await listCookbooks(ctx) };
      } catch {
        return { serverId, serverName, org, ok: false, error: "couldn't load cookbooks" };
      }
    }),
  );
  const { succeeded, failed } = partitionScoped(outcomes);

  const cookbooks: CookbookRow[] = succeeded.flatMap(({ serverId, serverName, org, data }) =>
    data.map((c) => ({
      ...c,
      server: serverName,
      org,
      href: objectPath(serverId, org, "cookbooks", c.name),
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
      <CookbooksTable cookbooks={cookbooks} />
    </div>
  );
}
