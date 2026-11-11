import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { currentAccountId } from "@/lib/guard";
import { canManageRoleGrants } from "@/lib/admin/access";

/**
 * Gates every route under one server's own admin area to a Platform Admin
 * or that server's own Server Admin -- an Org Admin reaches the narrower
 * org-scoped surface at app/servers/[server]/orgs/[org]/admin instead.
 */
export default async function ServerAdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ server: string }>;
}) {
  const accountId = await currentAccountId();
  const { server } = await params;
  if (!(await canManageRoleGrants(accountId, server))) {
    notFound();
  }
  return children;
}
