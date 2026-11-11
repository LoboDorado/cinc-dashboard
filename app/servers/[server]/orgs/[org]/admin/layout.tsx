import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { currentAccountId } from "@/lib/guard";
import { canManageRoleGrants } from "@/lib/admin/access";

/**
 * Gates every route under one org's own admin area to a Platform Admin,
 * that server's own Server Admin, or that org's own Org Admin.
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
  return children;
}
