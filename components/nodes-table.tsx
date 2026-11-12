"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
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
import { compareVersions, type NodeSummary } from "@/lib/cinc/fleet";
import { relativeAgo } from "@/lib/time";
import { ClientVersion } from "@/components/client-chip";
import { SortSelect, type SortOption } from "@/components/ui/sort-select";
import { FacetSelect, type FacetOption } from "@/components/ui/facet-select";
import { EmptyState } from "@/components/empty-state";
import { CommandSnippet } from "@/components/command-snippet";
import { NodesIllustration } from "@/components/illustrations";

/**
 * One row. `server`/`org` are set only by an aggregated (cross-server/org)
 * caller — when any row carries them, two extra sortable columns render.
 * `href` is fully resolved by the caller, mirroring `ResourceTable`'s
 * `ResourceRow`: a single-scope page has one link prefix for every row, but
 * an aggregated page's rows each point at a different server/org.
 * `lastCCRStatus` is collector-sourced and optional: absent (`undefined`)
 * means no collector covers this node at all; `null` means a collector does,
 * but reported nothing usable -- both read as "(unknown)" to a facet filter.
 */
export type NodeRow = NodeSummary & {
  href: string;
  server?: string;
  org?: string;
  lastCCRStatus?: "success" | "failure" | null;
};

const SORT_KEYS = ["name", "lastSeen", "client", "server", "org"] as const;
const DEFAULT_SORT: SortState = { key: "name", dir: "asc" };

/** Facet-select sentinel for "(unknown)" -- distinct from "" (no constraint). */
const CCR_UNKNOWN = "__unknown__";

type FacetState = { platform: string; environment: string; policyGroup: string; ccrStatus: string };
const DEFAULT_FACETS: FacetState = { platform: "", environment: "", policyGroup: "", ccrStatus: "" };

/** Distinct, sorted values actually present for a field, as facet options. */
function distinctOptions(nodes: NodeRow[], pick: (n: NodeRow) => string | null): FacetOption[] {
  const values = new Set<string>();
  for (const n of nodes) {
    const v = pick(n);
    if (v !== null) values.add(v);
  }
  return [...values].sort().map((v) => ({ value: v, label: v }));
}

/**
 * Converge-status options mirror the other facets' "only offer values
 * actually present" rule: Succeeded/Failed only appear if some row has them,
 * and "(unknown)" only appears if some row is missing a usable status --
 * never a bucket that's always empty, but never silently hiding unconfigured
 * nodes from being found either.
 */
function ccrStatusOptions(nodes: NodeRow[]): FacetOption[] {
  const present = new Set(nodes.map((n) => n.lastCCRStatus ?? null));
  const options: FacetOption[] = [];
  if (present.has("success")) options.push({ value: "success", label: "Succeeded" });
  if (present.has("failure")) options.push({ value: "failure", label: "Failed" });
  if (present.has(null)) options.push({ value: CCR_UNKNOWN, label: "(unknown)" });
  return options;
}

/** The phone sort picker's choices (no column headers to tap there). */
const MOBILE_SORTS: SortOption[] = [
  { label: "Name, A–Z", sort: DEFAULT_SORT },
  { label: "Name, Z–A", sort: { key: "name", dir: "desc" } },
  { label: "Last check-in, newest", sort: { key: "lastSeen", dir: "desc" } },
  { label: "Last check-in, oldest", sort: { key: "lastSeen", dir: "asc" } },
  { label: "Client, oldest first", sort: { key: "client", dir: "asc" } },
];

/** Bounds the DOM only — the search sweep returns every node at once. */
const PAGE_SIZE = 50;

/** Order nodes by the active column; "never seen" / "unknown version" pin last. */
function compareBy(a: NodeRow, b: NodeRow, sort: SortState): number {
  const { key, dir } = sort;
  switch (key) {
    case "lastSeen":
      return nullsLast<number>((x, y) => applyDir(byNumber(x, y), dir))(
        a.lastCheckIn,
        b.lastCheckIn,
      );
    case "client":
      return nullsLast<string>((x, y) => applyDir(compareVersions(x, y), dir))(
        a.chefVersion,
        b.chefVersion,
      );
    case "server":
      return applyDir(byString(a.server ?? "", b.server ?? ""), dir);
    case "org":
      return applyDir(byString(a.org ?? "", b.org ?? ""), dir);
    default:
      return applyDir(byString(a.name, b.name), dir);
  }
}

function matches(row: NodeRow, needle: string, facets: FacetState): boolean {
  if (facets.platform && row.platform !== facets.platform) return false;
  if (facets.environment && row.environment !== facets.environment) return false;
  if (facets.policyGroup && row.policyGroup !== facets.policyGroup) return false;
  if (facets.ccrStatus) {
    const normalized = row.lastCCRStatus ?? null;
    const want = facets.ccrStatus === CCR_UNKNOWN ? null : facets.ccrStatus;
    if (normalized !== want) return false;
  }
  if (needle === "") return true;
  return (
    row.name.toLowerCase().includes(needle) ||
    (row.server?.toLowerCase().includes(needle) ?? false) ||
    (row.org?.toLowerCase().includes(needle) ?? false)
  );
}

/**
 * The node list with last-check-in and client-version columns. Sourced from
 * the same fleet search as the dashboard, so it carries each node's
 * `lastCheckIn` and `chefVersion`/`clientStatus` for free. The relative
 * check-in label ticks live off `generatedAt` (the snapshot time), the way the
 * dashboard does, so "3m ago" stays honest without a reload.
 */
export function NodesTable({
  createHref,
  nodes,
  generatedAt,
}: {
  createHref: string;
  nodes: NodeRow[];
  /** Unix ms the snapshot was built — seeds the relative clock (stable for SSR). */
  generatedAt: number;
}) {
  const [q, setQ] = useState("");
  const [facets, setFacets] = useState<FacetState>(DEFAULT_FACETS);
  const [page, setPage] = useState(0);
  const { sort, setSort, replaceSort } = useSort("sort", DEFAULT_SORT, SORT_KEYS);
  const showScopeColumns = nodes.some((n) => n.server !== undefined || n.org !== undefined);

  // Start from the snapshot time (no hydration mismatch), then tick to the live
  // clock each second so the "Last check-in" labels age in place.
  const [now, setNow] = useState(generatedAt);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Options come from the full, unfiltered `nodes` array -- not narrowed by
  // whichever other facets are already set. Four independent dimensions at
  // this scale, not a drill-down catalog; cascading would add real
  // complexity (recompute on every other facet change, handle a selected
  // value disappearing out from under the user) for little payoff here.
  const platformOptions = useMemo(() => distinctOptions(nodes, (n) => n.platform), [nodes]);
  const environmentOptions = useMemo(() => distinctOptions(nodes, (n) => n.environment), [nodes]);
  const policyGroupOptions = useMemo(() => distinctOptions(nodes, (n) => n.policyGroup), [nodes]);
  const ccrStatusOpts = useMemo(() => ccrStatusOptions(nodes), [nodes]);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return nodes
      .filter((n) => matches(n, needle, facets))
      .sort((a, b) => compareBy(a, b, sort));
  }, [nodes, q, facets, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamp during render so a shrinking filter can never strand us past the end.
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  function onFilter(value: string) {
    setQ(value);
    setPage(0);
  }

  function onFacetChange(key: keyof FacetState, value: string) {
    setFacets((f) => ({ ...f, [key]: value }));
    setPage(0);
  }

  if (nodes.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Nodes" />
        <EmptyState
          illustration={<NodesIllustration />}
          title="No nodes yet"
          actions={
            <>
              <CommandSnippet
                commands={{
                  cinc: ["cinc node bootstrap HOST --ssh-user USER --node-name NAME"],
                  knife: ["knife bootstrap HOST -U USER --sudo -N NAME"],
                }}
                notes={{
                  cinc: (
                    <>
                      First time on this workstation? Run{" "}
                      <code className="font-mono">cinc config create</code> to
                      save your server URL and key.
                    </>
                  ),
                  knife: (
                    <>
                      First time on this workstation? Run{" "}
                      <code className="font-mono">knife configure</code>.
                    </>
                  ),
                }}
              />
              <Link href={createHref} className="text-sm text-link hover:underline">
                Or create a node record by hand
              </Link>
            </>
          }
        >
          A node is any machine the Cinc client manages. Bootstrap one over SSH
          and it registers itself here, with its health and client version.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Nodes"
        actions={
          <Link href={createHref}>
            <Button>New</Button>
          </Link>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <Input
          placeholder="Filter nodes…"
          aria-label="Filter nodes"
          value={q}
          onChange={(e) => onFilter(e.target.value)}
          className="w-full sm:max-w-xs"
        />
        <FacetSelect
          label="Platform"
          value={facets.platform}
          options={platformOptions}
          onChange={(v) => onFacetChange("platform", v)}
        />
        <FacetSelect
          label="Environment"
          value={facets.environment}
          options={environmentOptions}
          onChange={(v) => onFacetChange("environment", v)}
        />
        <FacetSelect
          label="Policy group"
          value={facets.policyGroup}
          options={policyGroupOptions}
          onChange={(v) => onFacetChange("policyGroup", v)}
        />
        <FacetSelect
          label="Converge status"
          value={facets.ccrStatus}
          options={ccrStatusOpts}
          onChange={(v) => onFacetChange("ccrStatus", v)}
        />
        <SortSelect
          options={MOBILE_SORTS}
          value={sort}
          onChange={replaceSort}
          className="sm:hidden"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            {q ? <>No nodes matching &ldquo;{q}&rdquo;.</> : "No nodes match the selected filters."}
          </p>
        ) : (
          <>
            {/* Phones: one card per node. From sm up: the sortable table. */}
            <ul aria-label="Nodes" className="divide-y divide-border sm:hidden">
              {visible.map((n) => (
                <li key={showScopeColumns ? `${n.server}/${n.org}/${n.name}` : n.name}>
                  <Link
                    href={n.href}
                    className="block space-y-1 px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 break-all font-mono text-sm text-text">
                        {n.name}
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-xs text-muted">
                        {n.lastCheckIn === null
                          ? "never"
                          : relativeAgo(now - n.lastCheckIn * 1000)}
                      </span>
                    </span>
                    <span className="block text-xs text-muted">
                      <ClientVersion version={n.chefVersion} status={n.clientStatus} />
                      {showScopeColumns && ` · ${n.server} / ${n.org}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Nodes, sortable by name, last check-in, and client version
                  {showScopeColumns ? ", server, and organization" : ""}
                </caption>
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <SortableTh label="Name" sortKey="name" sort={sort} onSort={setSort} />
                    <SortableTh
                      label="Last check-in"
                      sortKey="lastSeen"
                      sort={sort}
                      onSort={setSort}
                    />
                    <SortableTh
                      label="Client version"
                      sortKey="client"
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
                  {visible.map((n) => (
                    <tr
                      key={showScopeColumns ? `${n.server}/${n.org}/${n.name}` : n.name}
                      className="border-b border-border last:border-0 hover:bg-surface-2"
                    >
                      <td className="p-0">
                        <Link
                          href={n.href}
                          className="block px-4 py-2.5 font-mono text-sm text-text transition-colors hover:text-link"
                        >
                          <span className="truncate">{n.name}</span>
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                        {n.lastCheckIn === null
                          ? "never"
                          : relativeAgo(now - n.lastCheckIn * 1000)}
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        <ClientVersion version={n.chefVersion} status={n.clientStatus} />
                      </td>
                      {showScopeColumns && (
                        <>
                          <td className="px-4 py-2.5 text-muted">{n.server}</td>
                          <td className="px-4 py-2.5 text-muted">{n.org}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {filtered.length === 0
            ? `0 of ${nodes.length}`
            : `${start + 1}–${start + visible.length} of ${filtered.length}` +
              (filtered.length === nodes.length ? "" : ` (${nodes.length} total)`)}
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
