"use client";

import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { UserMenu } from "@/components/user-menu";
import { SiteFooter } from "@/components/site-footer";
import { PrimaryNavLinks } from "@/components/primary-nav";
import { MobileNav } from "@/components/mobile-nav";

/**
 * The shell for aggregated, scope-free pages (`app/(browse)/**`) — a
 * simplified sibling of {@link AppShell} with no server/org switchers (there's
 * no single current scope to switch) and no Breadcrumbs (which only render
 * for `/servers/<server>/orgs/<org>/...` paths) or CommandPalette (its org
 * search and "switch org" commands are inherently single-scope; a cross-org
 * command palette is a separate, later piece of work). `PrimaryNavLinks`/
 * `MobileNav` already degrade gracefully with no `server`/`org`: only the
 * `standalone` NAV entries (lib/nav.ts) render.
 */
export function BrowseShell({
  displayName,
  isPlatformMember = false,
  version,
  children,
}: {
  displayName: string;
  isPlatformMember?: boolean;
  version: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Skip link (WCAG 2.4.1): hidden until focused, lets keyboard users
          jump past the header and nav straight to the page content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <MobileNav displayName={displayName} isPlatformMember={isPlatformMember} />
          <Link
            href="/"
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
            <span className="hidden text-text min-[400px]:inline">dashboard</span>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* Below md the user menu lives in the MobileNav drawer. */}
          <div className="hidden md:block">
            <UserMenu name={displayName} isPlatformMember={isPlatformMember} />
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        {/* From md the sidebar; below that the same links live in the
            MobileNav drawer opened from the header. */}
        <nav
          aria-label="Primary"
          className="hidden w-48 shrink-0 border-r border-border bg-surface p-3 md:block"
        >
          <PrimaryNavLinks />
        </nav>

        <main id="main-content" tabIndex={-1} className="flex-1 p-4 md:p-6">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
      <SiteFooter version={version} />
    </div>
  );
}
