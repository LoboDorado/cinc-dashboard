import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { currentAccountId } from "@/lib/guard";
import { canManageRoleGrants } from "@/lib/admin/access";
import { ScopedAdminNav } from "@/components/admin/scoped-admin-nav";

/**
 * Gates every route under one org's own admin area to a Platform Admin,
 * that server's own Server Admin, or that org's own Org Admin. This tree
 * nests under app/servers/[server]/orgs/[org]/**, so OrgLayout's AppShell
 * (header/sidebar/footer) already wraps it -- just add the Roles/Audit
 * sub-nav the sidebar itself doesn't carry.
 */
export default async function OrgAdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ server: string; org: string }>;
}) {
  const accountId = await currentAccountId();
  const { server, org } = await params;
  if (!(await canManageRoleGrants(accountId, server, org))) {
    notFound();
  }
  return (
    <div className="space-y-4">
      <ScopedAdminNav
        links={[
          { label: "Role grants", href: `/servers/${server}/orgs/${org}/admin/roles` },
          { label: "Audit log", href: `/servers/${server}/orgs/${org}/admin/audit` },
        ]}
      />
      {children}
    </div>
  );
}
