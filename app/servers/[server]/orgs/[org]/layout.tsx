import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { currentAccount } from "@/lib/guard";
import {
  requireScopeAccess,
  listReachableOrgs,
  listReachableServers,
  isPlatformMemberAccount,
  canManageRoleGrants,
} from "@/lib/admin/access";
import { AppShell } from "@/components/app-shell";
import { APP_VERSION } from "@/lib/version";

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ server: string; org: string }>;
}) {
  const account = await currentAccount();
  const { server, org } = await params;

  // A server/org slug this account has no grant for is a 404 — otherwise a
  // bogus org like /servers/s1/orgs/typo would render the whole shell and
  // only fail object-by-object.
  if (!(await requireScopeAccess(account.id, server, org))) {
    notFound();
  }

  const [orgs, servers, isPlatformMember, canManageRoles] = await Promise.all([
    listReachableOrgs(account.id, server),
    listReachableServers(account.id),
    isPlatformMemberAccount(account.id),
    canManageRoleGrants(account.id, server, org),
  ]);

  return (
    <AppShell
      server={server}
      servers={servers}
      org={org}
      orgs={orgs}
      displayName={account.displayName}
      isPlatformMember={isPlatformMember}
      canManageRoles={canManageRoles}
      version={APP_VERSION}
    >
      {children}
    </AppShell>
  );
}
