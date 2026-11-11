import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { RevokeGrantButton } from "@/components/admin/revoke-grant-button";
import { ROLE_LABELS } from "@/components/admin/role-grant-form";
import { listRoleGrants } from "@/lib/admin/grants";
import { revokeGrantAction } from "./actions";

export default async function OrgRolesPage({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  const grants = await listRoleGrants({ kind: "org", serverId: server, org });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Role grants"
        description={`Role grants scoped to ${org}.`}
        actions={
          <Link href={`/servers/${server}/orgs/${org}/admin/roles/new`} className={buttonClass()}>
            Grant a role
          </Link>
        }
      />

      {grants.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No role grants in this org yet.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Role grants for this org</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Account</th>
                <th scope="col" className="px-4 py-2 font-medium">Role</th>
                <th scope="col" className="px-4 py-2 font-medium">Object types</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-text">{g.accountUsername}</td>
                  <td className="px-4 py-2 text-muted">{ROLE_LABELS[g.role]}</td>
                  <td className="px-4 py-2 text-muted">
                    {g.objectTypes.length > 0 ? g.objectTypes.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end">
                      <RevokeGrantButton onRevoke={revokeGrantAction.bind(null, server, org, g.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
