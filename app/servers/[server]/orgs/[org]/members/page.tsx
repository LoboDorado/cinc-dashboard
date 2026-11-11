import { currentAccountId } from "@/lib/guard";
import { requireOrgAccess } from "@/lib/admin/access";
import { members } from "@/lib/cinc/members";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { InviteForm } from "./invite-form";
import { UsersList, GroupsList } from "./sortable-lists";
import { inviteUser, removeUser } from "./actions";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  const accountId = await currentAccountId();
  const base = `/servers/${server}/orgs/${org}/members`;

  const ctxRes = await safeGet(() => requireOrgAccess(accountId, server, org));
  if ("error" in ctxRes) {
    return <p className="text-sm text-danger">{explainRead(ctxRes.error)}</p>;
  }
  const ctx = ctxRes.data;

  const [usersRes, groupsRes] = await Promise.all([
    safeGet(() => members.listUsers(ctx)),
    safeGet(() => members.listGroups(ctx)),
  ]);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <InviteForm onInvite={inviteUser.bind(null, server, org)} />
        {"error" in usersRes ? (
          <p className="text-sm text-danger">{explainRead(usersRes.error)}</p>
        ) : usersRes.data.length === 0 ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <p className="p-4 text-sm text-muted">No users.</p>
          </div>
        ) : (
          <UsersList
            items={usersRes.data.map((d) => ({
              name: d.user.username,
              onRemove: removeUser.bind(null, server, org, d.user.username),
            }))}
          />
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Groups</h2>
        {"error" in groupsRes ? (
          <p className="text-sm text-danger">{explainRead(groupsRes.error)}</p>
        ) : Object.keys(groupsRes.data).length === 0 ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <p className="p-4 text-sm text-muted">No groups.</p>
          </div>
        ) : (
          <GroupsList basePath={base} names={Object.keys(groupsRes.data)} />
        )}
      </section>
    </div>
  );
}
