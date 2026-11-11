"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { label: "Servers", href: "/admin/servers" },
  { label: "Collectors", href: "/admin/collectors" },
  { label: "Accounts", href: "/admin/accounts" },
  { label: "Audit Log", href: "/admin/audit" },
];

function navLinkClass(active: boolean): string {
  return cn(
    "block whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors",
    active
      ? "bg-primary/15 text-link font-medium"
      : "text-muted hover:bg-surface-2 hover:text-text",
  );
}

/** The platform admin area's section links -- servers/collectors/accounts/audit log. */
export function AdminNavLinks() {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={navLinkClass(active)}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
