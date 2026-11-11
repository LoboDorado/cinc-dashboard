import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGrantForm } from "@/components/admin/role-grant-form";
import { getAccountById } from "@/lib/dashboard/accounts";
import { listRegisteredServers } from "@/lib/admin/servers";
import { loadGrants } from "@/lib/admin/access";
import { grantableRoles } from "@/lib/admin/policy";
import { currentAccountId } from "@/lib/guard";
import { grantRoleAction, listOrgsForServerAction } from "../../../actions";

export default async function NewGrantPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const [account, servers, viewerId] = await Promise.all([
    getAccountById(accountId),
    listRegisteredServers(),
    currentAccountId(),
  ]);
  if (!account) notFound();

  // These use placeholder scope ids: for a Platform Admin (the only account
  // able to reach this screen's submit action) grantableRoles' platform-tier
  // branch doesn't look at serverId/org at all, so the role list is the same
  // for every server/org. lib/admin/grants.ts re-checks the real scope at
  // submission regardless -- this is just what populates the dropdown.
  const viewerGrants = await loadGrants(viewerId);
  const rolesForScope = {
    platform: grantableRoles(viewerGrants, { kind: "platform" }),
    server: grantableRoles(viewerGrants, { kind: "server", serverId: "" }),
    org: grantableRoles(viewerGrants, { kind: "org", serverId: "", org: "" }),
  };

  return (
    <div className="space-y-4">
      <PageHeader title={`Grant a role to ${account.username}`} />
      <RoleGrantForm
        allServers={servers}
        rolesForScope={rolesForScope}
        fixedTargetAccountId={accountId}
        onListOrgs={listOrgsForServerAction}
        onSubmit={(values) => grantRoleAction(accountId, values.role, values.scope, values.objectTypes)}
        cancelHref={`/admin/accounts/${accountId}`}
      />
    </div>
  );
}
