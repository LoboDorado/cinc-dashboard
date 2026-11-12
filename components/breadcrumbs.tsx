"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";
import { listPath } from "@/lib/urls";

type Crumb = { label: string; href: string; link: boolean };

/**
 * Path-derived breadcrumb for org pages, e.g. `Primary / acme / Data Bags /
 * secrets / api_key`. The leading crumb is the server's display name — plain
 * text, not a link: there's no page left that lists "every org on this
 * server" to send it to (that picker is gone). The org and section/object
 * segments link to their pages; "groups" under members is a structural path
 * segment (no list page of its own) so it's shown as plain text. The last
 * crumb is the current page. Nothing renders on the org home or outside /orgs.
 */
export function Breadcrumbs({ serverName }: { serverName: string }) {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  // /servers/<server>/orgs/<org>/<section>/... — need at least a section.
  if (parts[0] !== "servers" || parts[2] !== "orgs" || parts.length < 5) return null;

  const server = parts[1];
  const org = parts[3];
  const rest = parts.slice(4);

  const crumbs: Crumb[] = [
    { label: serverName, href: "", link: false },
    { label: decodeURIComponent(org), href: `/servers/${server}/orgs/${org}`, link: true },
  ];
  let acc = `/servers/${server}/orgs/${org}`;
  rest.forEach((seg, i) => {
    acc += `/${seg}`;
    const isSection = i === 0;
    const navEntry = isSection ? NAV.find((n) => n.slug === seg) : undefined;
    const label = isSection ? (navEntry?.label ?? decodeURIComponent(seg)) : decodeURIComponent(seg);
    // "groups" sits under /members but has no list page of its own.
    const structural = seg === "groups" && rest[i - 1] === "members";
    // A section that's moved to an aggregated, scope-free list (lib/nav.ts)
    // no longer has a page at this per-org path — point its crumb there instead.
    const href = navEntry?.standalone ? listPath(seg) : acc;
    crumbs.push({ label, href, link: !structural });
  });

  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href} className="flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden="true" className="text-border">
                  /
                </span>
              )}
              {last ? (
                <span aria-current="page" className="text-text">
                  {c.label}
                </span>
              ) : c.link ? (
                <Link href={c.href} className="hover:text-link">
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
