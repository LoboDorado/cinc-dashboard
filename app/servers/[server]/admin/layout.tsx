import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { currentAccount } from "@/lib/guard";
import { canManageRoleGrants, isPlatformMemberAccount } from "@/lib/admin/access";
import { UserMenu } from "@/components/user-menu";
import { SiteFooter } from "@/components/site-footer";
import { ScopedAdminNav } from "@/components/admin/scoped-admin-nav";
import { APP_VERSION } from "@/lib/version";

/**
 * Gates every route under one server's own admin area to a Platform Admin
 * or that server's own Server Admin -- an Org Admin reaches the narrower
 * org-scoped surface at app/servers/[server]/orgs/[org]/admin instead.
 *
 * This tree sits outside app/servers/[server]/orgs/[org]/**, so it doesn't
 * inherit OrgLayout's AppShell -- it gets its own minimal header/footer here,
 * matching the org picker page's style.
 */
export default async function ServerAdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ server: string }>;
}) {
  const account = await currentAccount();
  const { server } = await params;
  const [allowed, isPlatformMember] = await Promise.all([
    canManageRoleGrants(account.id, server),
    isPlatformMemberAccount(account.id),
  ]);
  if (!allowed) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-4">
          <Link
            href={`/servers/${server}/orgs`}
            className="flex items-center gap-2 text-lg font-semibold tracking-tight"
          >
            <Image src="/cinc/logo-icon.png" alt="Cinc" width={22} height={22} priority unoptimized />
            <span className="text-text">dashboard</span>
          </Link>
          <Link href={`/servers/${server}/orgs`} className="text-sm text-muted hover:text-link">
            ← back to organizations
          </Link>
        </div>
        <UserMenu name={account.displayName} isPlatformMember={isPlatformMember} />
      </header>

      <main className="flex-1 p-4 md:p-6">
        <div className="mx-auto w-full max-w-[1600px] space-y-4">
          <ScopedAdminNav
            links={[
              { label: "Role grants", href: `/servers/${server}/admin/roles` },
              { label: "Audit log", href: `/servers/${server}/admin/audit` },
            ]}
          />
          {children}
        </div>
      </main>
      <SiteFooter version={APP_VERSION} />
    </div>
  );
}
