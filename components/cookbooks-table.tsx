"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { EmptyState } from "@/components/empty-state";
import { CommandSnippet } from "@/components/command-snippet";
import { CookbooksIllustration } from "@/components/illustrations";
import { PageHeader } from "./ui/page-header";
import { SortableTh } from "./ui/sortable";
import { useSort } from "./ui/use-sort";
import {
  applyDir,
  byNumber,
  byString,
  nullsLast,
  type SortState,
} from "@/lib/sort";
import { compareVersions } from "@/lib/cinc/fleet";
import type { CookbookSummary } from "@/lib/cinc/cookbooks";

/**
 * One row. `href` is fully resolved by the caller — a single-scope page has
 * one prefix for every row, but an aggregated page's rows each point at a
 * different server/org, so there's no single prefix to share. `server`/`org`
 * are set only by an aggregated caller; when present, two extra sortable
 * columns render (same convention as ResourceTable/NodesTable).
 */
export type CookbookRow = CookbookSummary & { href: string; server?: string; org?: string };

const SORT_KEYS = ["name", "latest", "count", "server", "org"] as const;
const DEFAULT_SORT: SortState = { key: "name", dir: "asc" };

/** Bounds the DOM only — the Cinc list call returns every cookbook at once. */
const PAGE_SIZE = 50;

/** Order two summaries by the active column; cookbooks with no version sort last. */
function compareBy(a: CookbookRow, b: CookbookRow, sort: SortState): number {
  switch (sort.key) {
    case "latest":
      return nullsLast<string>((x, y) => applyDir(compareVersions(x, y), sort.dir))(
        a.latest,
        b.latest,
      );
    case "count":
      return applyDir(byNumber(a.count, b.count), sort.dir);
    case "server":
      return applyDir(byString(a.server ?? "", b.server ?? ""), sort.dir);
    case "org":
      return applyDir(byString(a.org ?? "", b.org ?? ""), sort.dir);
    default:
      return applyDir(byString(a.name, b.name), sort.dir);
  }
}

function matches(row: CookbookRow, needle: string): boolean {
  if (needle === "") return true;
  return (
    row.name.toLowerCase().includes(needle) ||
    (row.server?.toLowerCase().includes(needle) ?? false) ||
    (row.org?.toLowerCase().includes(needle) ?? false)
  );
}

/**
 * The cookbooks list: a searchable, paginated table sortable by name, latest
 * version, or number of versions. Unlike the shared {@link ResourceTable} this
 * carries extra columns, so — like the members page — it is its own component.
 */
export function CookbooksTable({ cookbooks }: { cookbooks: CookbookRow[] }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const { sort, setSort } = useSort("sort", DEFAULT_SORT, SORT_KEYS);
  const showScopeColumns = cookbooks.some((c) => c.server !== undefined || c.org !== undefined);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return cookbooks.filter((c) => matches(c, needle)).sort((a, b) => compareBy(a, b, sort));
  }, [cookbooks, q, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamp during render so a shrinking filter can never strand us past the end.
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  function onFilter(value: string) {
    setQ(value);
    setPage(0);
  }

  if (cookbooks.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Cookbooks" />
        <EmptyState
          illustration={<CookbooksIllustration />}
          title="No cookbooks yet"
          actions={
            <CommandSnippet
              commands={{
                cinc: ["cinc cookbook upload COOKBOOK"],
                knife: ["knife cookbook upload COOKBOOK"],
              }}
            />
          }
        >
          Cookbooks hold the recipes your nodes run. Upload them from your
          workstation; this page lists every version and lets you delete them.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Cookbooks" />

      <Input
        placeholder="Filter cookbooks…"
        value={q}
        onChange={(e) => onFilter(e.target.value)}
        className="max-w-xs"
      />

      <div className="overflow-hidden rounded-lg border border-border">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            No cookbooks matching &ldquo;{q}&rdquo;.
          </p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">
              Cookbooks, sortable by name, latest version, and version count
              {showScopeColumns ? ", server, and organization" : ""}
            </caption>
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <SortableTh label="Name" sortKey="name" sort={sort} onSort={setSort} />
                <SortableTh
                  label="Latest version"
                  sortKey="latest"
                  sort={sort}
                  onSort={setSort}
                />
                <SortableTh
                  label="Versions"
                  sortKey="count"
                  sort={sort}
                  onSort={setSort}
                />
                {showScopeColumns && (
                  <>
                    <SortableTh label="Server" sortKey="server" sort={sort} onSort={setSort} />
                    <SortableTh label="Org" sortKey="org" sort={sort} onSort={setSort} />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr
                  key={showScopeColumns ? `${c.server}/${c.org}/${c.name}` : c.name}
                  className="border-b border-border last:border-0 hover:bg-surface-2"
                >
                  <td className="p-0">
                    <Link
                      href={c.href}
                      className="block px-4 py-2.5 font-mono text-sm text-text transition-colors hover:text-link"
                    >
                      <span className="truncate">{c.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-text">
                    {c.latest ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-text">{c.count}</td>
                  {showScopeColumns && (
                    <>
                      <td className="px-4 py-2.5 text-muted">{c.server}</td>
                      <td className="px-4 py-2.5 text-muted">{c.org}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {filtered.length === 0
            ? `0 of ${cookbooks.length}`
            : `${start + 1}–${start + visible.length} of ${filtered.length}` +
              (filtered.length === cookbooks.length
                ? ""
                : ` (${cookbooks.length} total)`)}
        </span>
        {pageCount > 1 && (
          <span className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              aria-label="Previous page"
            >
              Prev
            </Button>
            <span>
              {current + 1} / {pageCount}
            </span>
            <Button
              variant="secondary"
              onClick={() => setPage(current + 1)}
              disabled={current >= pageCount - 1}
              aria-label="Next page"
            >
              Next
            </Button>
          </span>
        )}
      </div>
    </div>
  );
}
