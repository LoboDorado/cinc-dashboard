import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { UserMenu } from "@/components/user-menu";
import { SiteFooter } from "@/components/site-footer";
import { AdminNavLinks } from "./admin-nav";

/**
 * Shell for the platform admin area (app/admin/**): same skip-link/header/
 * sidebar structure as AppShell, without the server/org switchers or
 * command palette -- this area isn't scoped to either.
 */
export function AdminShell({
  displayName,
  version,
  children,
}: {
  displayName: string;
  version: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link
            href="/admin"
            className="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight"
          >
            <Image
              src="/cinc/logo-icon.png"
              alt="Cinc"
              width={22}
              height={22}
              priority
              unoptimized
            />
            <span className="text-text">dashboard admin</span>
          </Link>
          <Link href="/servers" className="text-sm text-muted hover:text-link">
            ← back to servers
          </Link>
        </div>
        <UserMenu name={displayName} isPlatformMember />
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <nav
          aria-label="Admin"
          className="w-full shrink-0 border-b border-border bg-surface p-3 md:w-48 md:border-b-0 md:border-r"
        >
          <AdminNavLinks />
        </nav>

        <main id="main-content" tabIndex={-1} className="flex-1 p-4 md:p-6">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
      <SiteFooter version={version} />
    </div>
  );
}
