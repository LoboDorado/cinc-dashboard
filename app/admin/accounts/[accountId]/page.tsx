import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { RevokeGrantButton } from "@/components/admin/revoke-grant-button";
import { ROLE_LABELS } from "@/components/admin/role-grant-form";
import { getAccountById } from "@/lib/dashboard/accounts";
import { listGrantsForAccount } from "@/lib/admin/grants";
import { listRegisteredServers } from "@/lib/admin/servers";
import { isPlatformAdminAccount } from "@/lib/admin/access";
import { currentAccountId } from "@/lib/guard";
import { revokeRoleGrantAction } from "../actions";

function describeScope(
  grant: { serverId: string | null; org: string | null },
  serverNames: Map<string, string>,
): string {
  if (grant.serverId === null) return "Platform-wide";
  const serverName = serverNames.get(grant.serverId) ?? grant.serverId;
  return grant.org === null ? `Server: ${serverName}` : `Org "${grant.org}" on ${serverName}`;
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const [account, viewerId] = await Promise.all([getAccountById(accountId), currentAccountId()]);
  if (!account) notFound();

  const canViewGrants = await isPlatformAdminAccount(viewerId);
  const [grants, servers] = canViewGrants
    ? await Promise.all([listGrantsForAccount(accountId), listRegisteredServers()])
    : [[], []];
  const serverNames = new Map(servers.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title={account.username}
        description={`${account.displayName} · ${account.authSource === "ldap" ? "LDAP-linked" : "Local account"}`}
      />

      {canViewGrants ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-text">Role grants</h2>
            <Link href={`/admin/accounts/${accountId}/grants/new`} className={buttonClass()}>
              Grant a role
            </Link>
          </div>

          {grants.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">This account has no role grants yet.</p>
            </Card>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">Role grants for {account.username}</caption>
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th scope="col" className="px-4 py-2 font-medium">Role</th>
                    <th scope="col" className="px-4 py-2 font-medium">Scope</th>
                    <th scope="col" className="px-4 py-2 font-medium">Object types</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grants.map((g) => (
                    <tr key={g.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-medium text-text">{ROLE_LABELS[g.role]}</td>
                      <td className="px-4 py-2 text-muted">{describeScope(g, serverNames)}</td>
                      <td className="px-4 py-2 text-muted">
                        {g.objectTypes.length > 0 ? g.objectTypes.join(", ") : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end">
                          <RevokeGrantButton onRevoke={revokeRoleGrantAction.bind(null, accountId, g.id)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <Card>
          <p className="text-sm text-muted">Only Platform Admins can view this account&apos;s role grants.</p>
        </Card>
      )}
    </div>
  );
}
