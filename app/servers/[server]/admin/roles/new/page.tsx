import { PageHeader } from "@/components/ui/page-header";
import { RoleGrantForm } from "@/components/admin/role-grant-form";
import { loadGrants } from "@/lib/admin/access";
import { grantableRoles, type Role } from "@/lib/admin/policy";
import { currentAccountId } from "@/lib/guard";
import { grantRoleToUsernameAction, listOrgsForServerAction } from "../actions";

export default async function NewServerRoleGrantPage({
  params,
}: {
  params: Promise<{ server: string }>;
}) {
  const { server } = await params;
  const viewerId = await currentAccountId();
  const viewerGrants = await loadGrants(viewerId);

  // The org placeholder is safe here: a Server Admin's "isServerAdminHere"
  // check in grantableRoles doesn't look at the specific org, so this list is
  // the same for every org on this server. lib/admin/grants.ts re-checks the
  // real scope at submission regardless.
  const rolesForScope = {
    platform: [] as Role[],
    server: grantableRoles(viewerGrants, { kind: "server", serverId: server }),
    org: grantableRoles(viewerGrants, { kind: "org", serverId: server, org: "" }),
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Grant a role on this server" />
      <RoleGrantForm
        allServers={[]}
        rolesForScope={rolesForScope}
        scopeKinds={["server", "org"]}
        fixedServerId={server}
        onListOrgs={listOrgsForServerAction}
        onSubmit={grantRoleToUsernameAction.bind(null, server)}
        cancelHref={`/servers/${server}/admin/roles`}
      />
    </div>
  );
}
