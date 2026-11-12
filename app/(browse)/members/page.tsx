import { currentAccountId } from "@/lib/guard";
import { listReachableScopes, requireOrgAccessMany } from "@/lib/admin/access";
import { members } from "@/lib/cinc/members";
import { partitionScoped, type ScopedOutcome } from "@/lib/cinc/aggregate";
import { ResourceTable, type ResourceRow } from "@/components/resource-table";
import { orgPath, objectPath } from "@/lib/urls";

type MemberLists = { users: string[]; groups: string[] };

/**
 * Read-only directory of every user and group across every org this account
 * can reach. Purely additive -- unlike every other kind, the per-org
 * `/servers/<server>/orgs/<org>/members` page stays: it's also where invite
 * and remove actually happen (mutations embedded in the list, not a separate
 * detail route), so a user row links there ("manage in <org>") rather than to
 * a per-user page that doesn't exist. A group row links to its real detail
 * page, which is unaffected by this migration.
 */
export default async function MembersPage() {
  const accountId = await currentAccountId();
  const { scopes, unavailable } = await listReachableScopes(accountId);
  const { contexts } = await requireOrgAccessMany(
    accountId,
    scopes.map(({ serverId, org }) => ({ serverId, org })),
  );
  const serverNameOf = new Map(scopes.map((s) => [s.serverId, s.serverName]));

  const outcomes: ScopedOutcome<MemberLists>[] = await Promise.all(
    contexts.map(async ({ serverId, org, ctx }): Promise<ScopedOutcome<MemberLists>> => {
      const serverName = serverNameOf.get(serverId) ?? serverId;
      try {
        const [users, groups] = await Promise.all([members.listUsers(ctx), members.listGroups(ctx)]);
        return {
          serverId,
          serverName,
          org,
          ok: true,
          data: { users: users.map((u) => u.user.username), groups: Object.keys(groups) },
        };
      } catch {
        return { serverId, serverName, org, ok: false, error: "couldn't load members" };
      }
    }),
  );
  const { succeeded, failed } = partitionScoped(outcomes);

  const userRows: ResourceRow[] = succeeded.flatMap(({ serverId, serverName, org, data }) =>
    data.users.map((name) => ({
      name,
      server: serverName,
      org,
      href: `${orgPath(serverId, org)}/members`,
    })),
  );
  const groupRows: ResourceRow[] = succeeded.flatMap(({ serverId, serverName, org, data }) =>
    data.groups.map((name) => ({
      name,
      server: serverName,
      org,
      href: objectPath(serverId, org, "members/groups", name),
    })),
  );

  const failedScopes = [
    ...unavailable.map((u) => `${u.serverName} (${u.reason})`),
    ...failed.map((f) => `${f.serverName} / ${f.org}`),
  ];

  return (
    <div className="space-y-10">
      {failedScopes.length > 0 && (
        <p role="alert" className="text-sm text-warn">
          Couldn&apos;t load {failedScopes.length} scope{failedScopes.length === 1 ? "" : "s"}:{" "}
          {failedScopes.join("; ")}
        </p>
      )}
      <ResourceTable title="Users" rows={userRows} />
      <ResourceTable title="Groups" rows={groupRows} />
    </div>
  );
}
