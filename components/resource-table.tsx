"use client";

import { useState, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { PageHeader } from "./ui/page-header";
import { SortableTh } from "./ui/sortable";
import { useSort } from "./ui/use-sort";
import { applyDir, byString, type SortState } from "@/lib/sort";

/**
 * One row. `server`/`org` are set only by an aggregated (cross-server/org)
 * caller — when any row carries them, two extra sortable columns render.
 * `href` is fully resolved by the caller (a single-scope page has one
 * `basePath` prefix for every row; an aggregated page's rows each point at a
 * different server/org, so there's no single prefix to share).
 */
export type ResourceRow = {
  name: string;
  href: string;
  server?: string;
  org?: string;
  /**
   * True for a row the server creates on its own (`_default`, the org
   * validator). Computed by the caller (it knows the row's `name`/`org`) and
   * carried as plain data rather than a predicate prop, since a function
   * can't be passed from a Server Component page into this Client Component.
   */
  builtIn?: boolean;
};

/** Single-column lists sort by name only; direction is the user's to choose. */
const SORT_KEYS = ["name", "server", "org"] as const;
const DEFAULT_SORT: SortState = { key: "name", dir: "asc" };

/** Rows rendered per page. The Cinc list call returns every name at once, so
 * this only bounds the DOM — it keeps large orgs (thousands of nodes) snappy. */
const PAGE_SIZE = 50;

function compareBy(a: ResourceRow, b: ResourceRow, sort: SortState): number {
  switch (sort.key) {
    case "server":
      return applyDir(byString(a.server ?? "", b.server ?? ""), sort.dir);
    case "org":
      return applyDir(byString(a.org ?? "", b.org ?? ""), sort.dir);
    default:
      return applyDir(byString(a.name, b.name), sort.dir);
  }
}

function matches(row: ResourceRow, needle: string): boolean {
  if (needle === "") return true;
  return (
    row.name.toLowerCase().includes(needle) ||
    (row.server?.toLowerCase().includes(needle) ?? false) ||
    (row.org?.toLowerCase().includes(needle) ?? false)
  );
}

/** A searchable, paginated list of objects that link to their detail pages. */
export function ResourceTable({
  title,
  rows,
  createHref,
  empty,
}: {
  title: string;
  rows: ResourceRow[];
  createHref?: string;
  /**
   * The EmptyState shown when the org has none of this object yet. A list
   * holding only `builtIn` rows still counts as empty, so a new org gets this
   * instead of a one-row table; it should link to them so they stay reachable.
   */
  empty?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const { sort, setSort } = useSort("sort", DEFAULT_SORT, SORT_KEYS);
  const showScopeColumns = rows.some((r) => r.server !== undefined || r.org !== undefined);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return rows.filter((r) => matches(r, needle)).sort((a, b) => compareBy(a, b, sort));
  }, [rows, q, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamp during render so a shrinking filter can never strand us past the end.
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  function onFilter(value: string) {
    setQ(value);
    setPage(0);
  }

  // The empty state carries its own call to action, so the header's "New"
  // button and the filter box (nothing to filter) are left out.
  if (empty && rows.every((r) => r.builtIn)) {
    return (
      <div className="space-y-4">
        <PageHeader title={title} />
        {empty}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        actions={
          createHref && (
            <Link href={createHref}>
              <Button>New</Button>
            </Link>
          )
        }
      />

      <Input
        placeholder={`Filter ${title.toLowerCase()}…`}
        value={q}
        onChange={(e) => onFilter(e.target.value)}
        className="max-w-xs"
      />

      <div className="overflow-x-auto rounded-lg border border-border">
        {rows.length === 0 ? (
          <div className="p-4 text-sm text-muted">
            <p>No {title.toLowerCase()} in this organization yet.</p>
            {createHref && (
              <Link
                href={createHref}
                className="mt-2 inline-block text-link hover:underline"
              >
                Create one &rarr;
              </Link>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            No {title.toLowerCase()} matching &ldquo;{q}&rdquo;.
          </p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">
              {title}, sortable by name{showScopeColumns ? ", server, and organization" : ""}
            </caption>
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <SortableTh
                  label="Name"
                  sortKey="name"
                  sort={sort}
                  onSort={setSort}
                />
                {showScopeColumns && (
                  <>
                    <SortableTh
                      label="Server"
                      sortKey="server"
                      sort={sort}
                      onSort={setSort}
                    />
                    <SortableTh
                      label="Org"
                      sortKey="org"
                      sort={sort}
                      onSort={setSort}
                    />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={showScopeColumns ? `${row.server}/${row.org}/${row.name}` : row.name}
                  className="border-b border-border last:border-0 hover:bg-surface-2"
                >
                  <td className="p-0">
                    <Link
                      href={row.href}
                      className="flex items-center justify-between gap-2 px-4 py-2.5 font-mono text-sm text-text transition-colors hover:text-link"
                    >
                      <span className="truncate">{row.name}</span>
                      <span aria-hidden="true" className="text-muted">
                        →
                      </span>
                    </Link>
                  </td>
                  {showScopeColumns && (
                    <>
                      <td className="px-4 py-2.5 text-muted">{row.server}</td>
                      <td className="px-4 py-2.5 text-muted">{row.org}</td>
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
            ? `0 of ${rows.length}`
            : `${start + 1}–${start + visible.length} of ${filtered.length}` +
              (filtered.length === rows.length ? "" : ` (${rows.length} total)`)}
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
