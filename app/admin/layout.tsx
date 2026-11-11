import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { currentAccount } from "@/lib/guard";
import { isPlatformMemberAccount } from "@/lib/admin/access";
import { AdminShell } from "@/components/admin/admin-shell";
import { APP_VERSION } from "@/lib/version";

/**
 * Gates the whole platform admin area to platform_admin/platform_read_only.
 * Write actions (server actions under app/admin/**) additionally call
 * requirePlatformAdmin themselves -- this layout only decides who gets to
 * see the area at all.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const account = await currentAccount();
  if (!(await isPlatformMemberAccount(account.id))) {
    redirect("/servers");
  }

  return (
    <AdminShell displayName={account.displayName} version={APP_VERSION}>
      {children}
    </AdminShell>
  );
}
