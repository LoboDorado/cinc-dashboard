import type { ReactNode } from "react";
import { currentAccount } from "@/lib/guard";
import { isPlatformMemberAccount } from "@/lib/admin/access";
import { BrowseShell } from "@/components/browse-shell";
import { APP_VERSION } from "@/lib/version";

/**
 * Shell for every aggregated, scope-free page (`/roles`, `/nodes`, ...). No
 * `requireScopeAccess` gate — any authenticated account may browse; an
 * account with no grants anywhere just sees each page's own empty state.
 */
export default async function BrowseLayout({ children }: { children: ReactNode }) {
  const account = await currentAccount();
  const isPlatformMember = await isPlatformMemberAccount(account.id);

  return (
    <BrowseShell displayName={account.displayName} isPlatformMember={isPlatformMember} version={APP_VERSION}>
      {children}
    </BrowseShell>
  );
}
