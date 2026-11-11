import { PageHeader } from "@/components/ui/page-header";
import { RoleGrantForm } from "@/components/admin/role-grant-form";
import { loadGrants } from "@/lib/admin/access";
import { grantableRoles, type Role } from "@/lib/admin/policy";
import { currentAccountId } from "@/lib/guard";
import { grantRoleToUsernameAction } from "../actions";

export default async function NewOrgRoleGrantPage({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  const viewerId = await currentAccountId();
  const viewerGrants = await loadGrants(viewerId);
  const rolesForScope = {
    platform: [] as Role[],
    server: [] as Role[],
    org: grantableRoles(viewerGrants, { kind: "org", serverId: server, org }),
  };

  return (
    <div className="space-y-4">
      <PageHeader title={`Grant a role in ${org}`} />
      <RoleGrantForm
        allServers={[]}
        rolesForScope={rolesForScope}
        scopeKinds={["org"]}
        fixedServerId={server}
        fixedOrg={org}
        onSubmit={(values) =>
          grantRoleToUsernameAction(server, org, values.target, values.role, values.objectTypes)
        }
        cancelHref={`/servers/${server}/orgs/${org}/admin/roles`}
      />
    </div>
  );
}
