"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** A small active-aware tab row for switching between a delegated admin surface's own sub-pages (e.g. Role grants / Audit log). */
export function ScopedAdminNav({ links }: { links: { label: string; href: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex gap-1 border-b border-border pb-2">
      {links.map((l) => {
        const active = pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-primary/15 text-link font-medium"
                : "text-muted hover:bg-surface-2 hover:text-text",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
