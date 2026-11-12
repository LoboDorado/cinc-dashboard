"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV } from "@/lib/nav";
import { listPath } from "@/lib/urls";

/** Shared styling for a nav link; `active` gets the current-page treatment. */
function navLinkClass(active: boolean): string {
  return cn(
    "block whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors",
    active
      ? "bg-primary/15 text-link font-medium"
      : "text-muted hover:bg-surface-2 hover:text-text",
  );
}

/**
 * The section links — one list rendered by both the desktop sidebar and the
 * phone drawer, so the two can't drift apart. A `standalone` NAV entry (see
 * lib/nav.ts) always links to its aggregated, scope-free route; every other
 * entry links under the current org, so it (and the org Dashboard link and
 * the org's "Role grants" admin link) only render when `server`/`org` are
 * given — e.g. not on a scope-free aggregated page, which has no current org.
 */
export function PrimaryNavLinks({
  server,
  org,
  canManageRoles = false,
}: {
  server?: string;
  org?: string;
  /** This account can reach this org's delegated role-grant admin surface (Platform/Server/Org Admin). */
  canManageRoles?: boolean;
}) {
  const pathname = usePathname();
  const base = server && org ? `/servers/${server}/orgs/${org}` : null;
  const rolesHref = base ? `${base}/admin/roles` : null;
  return (
    <ul className="space-y-1">
      {/* Dashboard is the org root, not an object section, so it lives outside
          NAV and matches its path exactly — every sub-page's path starts with
          `base`, so startsWith would keep it always active. */}
      {base && (
        <li>
          <Link
            href={base}
            aria-current={pathname === base ? "page" : undefined}
            className={navLinkClass(pathname === base)}
          >
            Dashboard
          </Link>
        </li>
      )}
      {NAV.filter((item) => item.standalone || base !== null).map((item) => {
        const href = item.standalone ? listPath(item.slug) : `${base}/${item.slug}`;
        const active = pathname.startsWith(href);
        return (
          <li key={item.slug}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={navLinkClass(active)}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
      {canManageRoles && rolesHref && (
        <li className="mt-2 border-t border-border pt-2">
          <Link
            href={rolesHref}
            aria-current={pathname.startsWith(rolesHref) ? "page" : undefined}
            className={navLinkClass(pathname.startsWith(rolesHref))}
          >
            Role grants
          </Link>
        </li>
      )}
    </ul>
  );
}
