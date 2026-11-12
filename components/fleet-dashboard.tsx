"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { SortableTh } from "@/components/ui/sortable";
import { useSort } from "@/components/ui/use-sort";
import {
  applyDir,
  byNumber,
  byString,
  nullsLast,
  type SortState,
} from "@/lib/sort";
import {
  compareVersions,
  type FleetStats,
  type NodeSummary,
} from "@/lib/cinc/fleet";
import { relativeAgo } from "@/lib/time";
import { orgPath } from "@/lib/urls";
import { PlatformIcon } from "@/components/platform/platform-icon";
import { CheckInHistogram } from "@/components/fleet-histogram";
import { TILE_GRID } from "@/components/fleet-skeleton";
import { SortSelect, type SortOption } from "@/components/ui/sort-select";
import {
  IconArrowDown,
  IconCheck,
  IconQuestion,
  IconWarning,
} from "@/components/ui/icons";

/**
 * One row. `href` is fully resolved by the caller: a single-scope dashboard
 * has one server/org for every row, but the aggregated dashboard's rows each
 * point at a different one, so there's no single prefix to build a link from
 * here. `server`/`org`/`serverId` are set only by the aggregated caller --
 * when present, two extra sortable columns render and the "By organization"
 * breakdown groups on them.
 */
export type DashboardNode = NodeSummary & {
  href: string;
  serverId?: string;
  server?: string;
  org?: string;
};

export type DashboardSnapshot = { stats: FleetStats; nodes: DashboardNode[]; generatedAt: number };

/** One failed (server, org) scope, shown as a banner distinct from a single
 *  poll-level `error` string -- an aggregated dashboard can have several. */
export type FailedScope = { serverName: string; org: string; reason: string };

/** Which stat tile is the active filter for the node list, if any. */
type Filter = "recent" | "missing" | "unconfigured" | "outdated" | null;

// The node list refreshes on a poll interval so it stays live (10s for a
// single org; the aggregated dashboard uses a slower cadence since it re-runs
// a full multi-org sweep every tick -- see its own caller). The boom-stat
// tiles up top refresh on a calmer 60s cadence — the counts move slowly and
// the constant re-render is distracting. Both are fed by the same snapshot
// poll (no extra fetch): every poll updates the list, and the tiles are
// re-snapshotted from the freshest data once a minute. First paint is handled
// by streaming (see app/orgs/[org]/page.tsx), not by polling fast.
const DEFAULT_LIST_POLL_MS = 10_000;
const STATS_REFRESH_MS = 60_000;
/** Cap the rendered list so a huge fleet can't bloat the DOM; the count note is honest about it. */
const MAX_ROWS = 200;

/** Sortable columns of the node table. `server`/`org` are inert (no header
 *  renders for them) unless the caller's rows actually carry those fields. */
const SORT_KEYS = [
  "node",
  "status",
  "lastSeen",
  "env",
  "platform",
  "client",
  "server",
  "org",
] as const;
/** Default order matches the server's snapshot: most recently seen first. */
const DEFAULT_SORT: SortState = { key: "lastSeen", dir: "desc" };

/** The phone sort picker's choices (no column headers to tap there). */
const MOBILE_SORTS: SortOption[] = [
  { label: "Last check-in, newest", sort: DEFAULT_SORT },
  { label: "Last check-in, oldest", sort: { key: "lastSeen", dir: "asc" } },
  { label: "Status, worst first", sort: { key: "status", dir: "asc" } },
  { label: "Name, A–Z", sort: { key: "node", dir: "asc" } },
  { label: "Environment, A–Z", sort: { key: "env", dir: "asc" } },
  { label: "Client, oldest first", sort: { key: "client", dir: "asc" } },
];

const isOutdated = (n: NodeSummary) =>
  n.clientStatus === "eol" || n.clientStatus === "major-behind";

/**
 * Severity for sorting the Status column: ascending surfaces the nodes that
 * need attention first — missing, then unconfigured, then outdated, then
 * healthy. Within a tier, a node with more problems sorts first.
 */
function statusRank(n: NodeSummary): number {
  const tier = n.missing ? 0 : n.unconfigured ? 1 : isOutdated(n) ? 2 : 3;
  const problems = statusChips(n).length;
  return tier * 10 - problems;
}

/** Order nodes by the chosen column; "never seen" / "unknown version" pin last. */
function sortNodes(nodes: DashboardNode[], sort: SortState): DashboardNode[] {
  const { key, dir } = sort;
  const cmp = (a: DashboardNode, b: DashboardNode): number => {
    switch (key) {
      case "node":
        return applyDir(byString(a.name, b.name), dir);
      case "status":
        return applyDir(byNumber(statusRank(a), statusRank(b)), dir);
      case "lastSeen":
        return nullsLast<number>((x, y) => applyDir(byNumber(x, y), dir))(
          a.lastCheckIn,
          b.lastCheckIn,
        );
      case "env":
        return nullsLast<string>((x, y) => applyDir(byString(x, y), dir))(
          a.environment,
          b.environment,
        );
      case "platform":
        return nullsLast<string>((x, y) => applyDir(byString(x, y), dir))(
          platformText(a),
          platformText(b),
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
        return 0;
    }
  };
  return [...nodes].sort(cmp);
}

export function FleetDashboard({
  pollUrl,
  listPollMs = DEFAULT_LIST_POLL_MS,
  initial,
  initialError,
  failedScopes = [],
  showScopeColumns = false,
}: {
  /** Polled every `listPollMs` for a fresh DashboardSnapshot (JSON). */
  pollUrl: string;
  listPollMs?: number;
  initial: DashboardSnapshot | null;
  initialError: string | null;
  /** Scopes the aggregated dashboard couldn't load, shown as their own banner. */
  failedScopes?: FailedScope[];
  /** Renders the Server/Org columns and the "By organization" breakdown. */
  showScopeColumns?: boolean;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(initial);
  // The tiles read from their own `stats` state, refreshed on a slower cadence
  // than the list. `latestStats` always holds the freshest poll's stats so the
  // 60s timer can promote them without depending on a stale render closure.
  const [stats, setStats] = useState<FleetStats | undefined>(initial?.stats);
  const latestStats = useRef<FleetStats | undefined>(initial?.stats);
  const [error, setError] = useState<string | null>(initialError);
  const [filter, setFilter] = useState<Filter>(null);
  const [fetchedAt, setFetchedAt] = useState<number>(
    initial?.generatedAt ?? 0,
  );
  const [now, setNow] = useState<number>(initial?.generatedAt ?? 0);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  // Poll the fleet snapshot every LIST_POLL_MS to keep the node list live. We
  // keep the last good snapshot on a transient failure rather than blanking the
  // dashboard.
  useEffect(() => {
    let active = true;

    async function poll() {
      if (inFlight.current) return; // don't stack requests if one is slow
      inFlight.current = true;
      setRefreshing(true);
      try {
        const res = await fetch(pollUrl, { cache: "no-store" });
        if (!active) return;
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const json = await res.json();
        if (!active) return;
        if (json && typeof json === "object" && "error" in json) {
          setError(explainError(String(json.error)));
        } else {
          const t = Date.now();
          const next = json as DashboardSnapshot;
          setSnapshot(next);
          latestStats.current = next.stats;
          // Seed the tiles on the first data we ever get (e.g. SSR failed and
          // this is the recovery poll); thereafter the 60s timer owns them.
          setStats((cur) => cur ?? next.stats);
          setError(null);
          setFetchedAt(t);
          setNow(t);
        }
      } catch {
        if (active) setError("Couldn't reach the Cinc server — retrying.");
      } finally {
        if (active) setRefreshing(false);
        inFlight.current = false;
      }
    }

    // SSR gave us the first snapshot; only fetch immediately if it failed.
    // `poll` is async; wrap so its promise is explicitly fire-and-forget (and
    // we never hand setInterval a bare identifier).
    if (!initial) void poll();
    const id = setInterval(() => void poll(), listPollMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [pollUrl, listPollMs, initial, router]);

  // Promote the freshest stats into the tiles once a minute, decoupled from the
  // 10s list poll so the boom numbers don't flicker every few seconds.
  useEffect(() => {
    const id = setInterval(() => {
      if (latestStats.current) setStats(latestStats.current);
    }, STATS_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Tick once a second so the "updated Ns ago" / "Xh ago" labels stay live.
  // `now` starts from the SSR snapshot time (stable, no hydration mismatch) and
  // only advances here in the interval callback.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { sort, setSort, replaceSort } = useSort("sort", DEFAULT_SORT, SORT_KEYS);
  // `stats` (tiles) is the slow-cadence state above; `nodes` (list) tracks the
  // 10s snapshot directly.
  const nodes = useMemo(() => snapshot?.nodes ?? [], [snapshot]);
  const shown = sortNodes(filterNodes(nodes, filter), sort);
  const capped = shown.slice(0, MAX_ROWS);
  // Only appears once the full sweep has landed (nodes carry server/org from
  // the start, so no extra fetch is needed) -- not shown during the fast
  // counts-only preview tier, same as the histogram and node list.
  const breakdown = useMemo(() => orgBreakdown(nodes, showScopeColumns), [nodes, showScopeColumns]);

  const toggle = (f: Exclude<Filter, null>) =>
    setFilter((cur) => (cur === f ? null : f));

  return (
    <div className="space-y-6">
      {/* Stat tiles — each filters the node list below */}
      <div className={TILE_GRID}>
        <StatTile
          label="Checked in · last hour"
          help={stats ? `of ${stats.total} nodes` : "…"}
          count={stats?.recent}
          tone="success"
          icon={<IconCheck />}
          active={filter === "recent"}
          onClick={() => toggle("recent")}
        />
        <StatTile
          label="Missing"
          help={<MissingHelp stats={stats} />}
          count={stats?.missing}
          tone="danger"
          icon={<IconWarning />}
          active={filter === "missing"}
          onClick={() => toggle("missing")}
        />
        <StatTile
          label="Unconfigured"
          help={<UnconfiguredHelp stats={stats} />}
          count={stats?.unconfigured}
          tone="warn"
          icon={<IconQuestion />}
          active={filter === "unconfigured"}
          onClick={() => toggle("unconfigured")}
        />
        <StatTile
          label="Outdated clients"
          help={<OutdatedHelp stats={stats} />}
          count={stats?.outdated}
          tone={outdatedTone(stats)}
          icon={<IconArrowDown />}
          active={filter === "outdated"}
          onClick={() => toggle("outdated")}
        />
      </div>

      {stats && <CheckInHistogram counts={stats.checkIns} />}

      {/* Live status line + errors */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted" role="status" aria-live="polite">
          {stats ? `${stats.total} nodes total` : "Loading fleet…"}
          {fetchedAt > 0 && (
            <span className="text-muted">
              {" · updated "}
              {relativeAgo(now - fetchedAt)}
              {refreshing && (
                <span
                  aria-hidden="true"
                  className="ml-1 inline-block motion-safe:animate-pulse"
                >
                  ↻
                </span>
              )}
            </span>
          )}
        </p>
        {error && (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-danger"
          >
            <IconWarning />
            {error}
          </p>
        )}
      </div>

      {failedScopes.length > 0 && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-warn">
          <IconWarning />
          <span>
            Couldn&apos;t load {failedScopes.length} scope{failedScopes.length === 1 ? "" : "s"}:{" "}
            {failedScopes
              .map((f) => (f.org === "*" ? `${f.serverName} (${f.reason})` : `${f.serverName} / ${f.org} (${f.reason})`))
              .join("; ")}
          </span>
        </p>
      )}

      {breakdown.length > 1 && <OrgBreakdown rows={breakdown} />}

      {/* Node list */}
      <Card flush>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-text">
            {filter ? filterHeading(filter) : "Nodes"}
            <span className="ml-2 text-muted">{shown.length}</span>
          </h2>
          {filter && (
            <button
              type="button"
              onClick={() => setFilter(null)}
              className="rounded text-sm text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Clear filter
            </button>
          )}
          <SortSelect
            options={MOBILE_SORTS}
            value={sort}
            onChange={replaceSort}
            className="w-full sm:hidden"
          />
        </div>

        {capped.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            {snapshot ? "No nodes match." : "Loading…"}
          </p>
        ) : (
          <>
            {/* Phones: one card per node. From sm up: the sortable table. Both
                render; CSS shows one, so there's no layout flash on hydration. */}
            <ul aria-label="Fleet nodes" className="divide-y divide-border sm:hidden">
              {capped.map((n) => (
                <NodeCard key={rowKey(n, showScopeColumns)} node={n} now={now} />
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Fleet nodes; use the column headers to sort{showScopeColumns ? ", including server and organization" : ""}
                </caption>
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <SortableTh
                      label="Node"
                      sortKey="node"
                      sort={sort}
                      onSort={setSort}
                    />
                    <SortableTh
                      label="Status"
                      sortKey="status"
                      sort={sort}
                      onSort={setSort}
                    />
                    <SortableTh
                      label="Last check-in"
                      sortKey="lastSeen"
                      sort={sort}
                      onSort={setSort}
                    />
                    <SortableTh
                      label="Environment"
                      sortKey="env"
                      sort={sort}
                      onSort={setSort}
                    />
                    <SortableTh
                      label="Platform"
                      sortKey="platform"
                      sort={sort}
                      onSort={setSort}
                    />
                    <SortableTh
                      label="Client"
                      sortKey="client"
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
                  {capped.map((n) => (
                    <NodeRow key={rowKey(n, showScopeColumns)} node={n} now={now} showScopeColumns={showScopeColumns} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {shown.length > MAX_ROWS && (
          <p className="border-t border-border px-4 py-2 text-xs text-muted">
            Showing the first {MAX_ROWS} of {shown.length}. Use a stat tile to
            narrow the list.
          </p>
        )}
      </Card>
    </div>
  );
}

/** Disambiguates two same-named nodes from different scopes (React key and
 *  the aggregated dashboard's sort grouping both need this, not just links --
 *  those already have distinct `href`s). */
function rowKey(node: DashboardNode, showScopeColumns: boolean): string {
  return showScopeColumns ? `${node.server}/${node.org}/${node.name}` : node.name;
}

function NodeRow({
  node,
  now,
  showScopeColumns,
}: {
  node: DashboardNode;
  now: number;
  showScopeColumns: boolean;
}) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-2">
      <td className="px-4 py-2">
        <a
          href={node.href}
          className="font-mono text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {node.name}
        </a>
      </td>
      <td className="px-4 py-2">
        <StatusChips node={node} />
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-muted">
        {node.lastCheckIn === null
          ? "never"
          : relativeAgo(now - node.lastCheckIn * 1000)}
      </td>
      <td className="px-4 py-2 font-mono text-muted">
        {node.environment ?? "—"}
      </td>
      <td className="px-4 py-2 text-muted">
        {node.platform === null ? (
          "—"
        ) : (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span aria-hidden="true">
              <PlatformIcon platform={node.platform} />
            </span>
            {platformText(node)}
          </span>
        )}
      </td>
      <td className="px-4 py-2 tabular-nums text-muted">
        {node.chefVersion ?? "—"}
      </td>
      {showScopeColumns && (
        <>
          <td className="px-4 py-2 text-muted">{node.server}</td>
          <td className="px-4 py-2 text-muted">{node.org}</td>
        </>
      )}
    </tr>
  );
}

/** Phone layout for one node: name + last check-in, status chips, details. */
function NodeCard({ node, now }: { node: DashboardNode; now: number }) {
  const details = [node.server && node.org ? `${node.server} / ${node.org}` : null, node.environment, platformText(node), node.chefVersion]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="space-y-1.5 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <a
          href={node.href}
          className="min-w-0 break-all font-mono text-sm text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {node.name}
        </a>
        <span className="shrink-0 whitespace-nowrap text-xs text-muted">
          {node.lastCheckIn === null
            ? "never"
            : relativeAgo(now - node.lastCheckIn * 1000)}
        </span>
      </div>
      <StatusChips node={node} />
      {details && <p className="text-xs text-muted">{details}</p>}
    </li>
  );
}

type OrgBreakdownRow = {
  key: string;
  serverId: string;
  server: string;
  org: string;
  total: number;
  missing: number;
  unconfigured: number;
  outdated: number;
};

/** Groups the full snapshot's nodes by (server, org) for the secondary "By
 *  organization" strip -- a flat merged number can otherwise hide exactly one
 *  unhealthy org behind a healthy-looking aggregate. `[]` when there's only
 *  one (or zero) scope: nothing to break down. */
function orgBreakdown(nodes: DashboardNode[], showScopeColumns: boolean): OrgBreakdownRow[] {
  if (!showScopeColumns) return [];
  const byKey = new Map<string, OrgBreakdownRow>();
  for (const n of nodes) {
    if (n.serverId === undefined || n.server === undefined || n.org === undefined) continue;
    const key = `${n.serverId}/${n.org}`;
    let row = byKey.get(key);
    if (!row) {
      row = { key, serverId: n.serverId, server: n.server, org: n.org, total: 0, missing: 0, unconfigured: 0, outdated: 0 };
      byKey.set(key, row);
    }
    row.total++;
    if (n.missing) row.missing++;
    if (n.unconfigured) row.unconfigured++;
    if (isOutdated(n)) row.outdated++;
  }
  return [...byKey.values()].sort(
    (a, b) => a.server.localeCompare(b.server) || a.org.localeCompare(b.org),
  );
}

/** Dense, static (unsorted-by-the-user) secondary table -- kept visually
 *  smaller than the main stat tiles on purpose, so it doesn't compete with
 *  them for attention. */
function OrgBreakdown({ rows }: { rows: OrgBreakdownRow[] }) {
  return (
    <Card flush>
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-medium text-text">By organization</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Node counts per server and organization</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th scope="col" className="px-4 py-2 font-medium">
                Server / Org
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Total
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Missing
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Unconfigured
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Outdated
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className="px-4 py-2">
                  <Link href={orgPath(r.serverId, r.org)} className="text-link hover:underline">
                    {r.server} / {r.org}
                  </Link>
                </td>
                <td className="px-4 py-2 tabular-nums text-muted">{r.total}</td>
                <td className="px-4 py-2 tabular-nums text-muted">{r.missing}</td>
                <td className="px-4 py-2 tabular-nums text-muted">{r.unconfigured}</td>
                <td className="px-4 py-2 tabular-nums text-muted">{r.outdated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function StatTile({
  label,
  help,
  count,
  tone,
  icon,
  active,
  onClick,
}: {
  label: string;
  help: React.ReactNode;
  count: number | undefined;
  tone: "success" | "danger" | "warn" | "link";
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  const toneText = {
    success: "text-success",
    danger: "text-danger",
    warn: "text-warn",
    link: "text-link",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border bg-surface p-3 text-left shadow-[var(--shadow-sm)] transition-colors sm:p-5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active
          ? "border-primary bg-surface-2"
          : "border-border hover:border-muted",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-text">{label}</span>
        <span className={cn("mt-0.5 shrink-0", toneText)} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums sm:mt-2 sm:text-3xl", toneText)}>
        {count === undefined ? "—" : count}
      </div>
      <div className="mt-1 text-xs text-muted">{help}</div>
      {active && (
        <div className="mt-2 text-xs font-medium text-primary">
          Filtering list ↓
        </div>
      )}
    </button>
  );
}

/** Headline severity for the Outdated tile: EOL beats major-behind beats none. */
function outdatedTone(stats?: FleetStats): "danger" | "warn" | "link" {
  if ((stats?.eol ?? 0) > 0) return "danger";
  if ((stats?.majorBehind ?? 0) > 0) return "warn";
  return "link";
}

/** Tile subtext that calls out the EOL vs major-behind split. */
function OutdatedHelp({ stats }: { stats?: FleetStats }) {
  if (!stats) return <>…</>;
  if (stats.outdated === 0) {
    return (
      <>
        {stats.latestVersion
          ? `All on ${stats.latestVersion}`
          : "All on supported majors"}
      </>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      {stats.eol > 0 && (
        <span className="font-medium text-danger">{stats.eol} EOL</span>
      )}
      {stats.eol > 0 && stats.majorBehind > 0 && (
        <span aria-hidden="true">·</span>
      )}
      {stats.majorBehind > 0 && (
        <span className="font-medium text-warn">
          {stats.majorBehind} major release behind
        </span>
      )}
    </span>
  );
}

/** Missing-tile subtext: the threshold, plus how many have never checked in. */
function MissingHelp({ stats }: { stats?: FleetStats }) {
  if (!stats) return <>…</>;
  return (
    <>
      No check-in in 12 hours
      {stats.never > 0 && ` · ${stats.never} never`}
    </>
  );
}

/** Unconfigured-tile subtext: why — empty run list vs left in _default. */
function UnconfiguredHelp({ stats }: { stats?: FleetStats }) {
  if (!stats) return <>…</>;
  if (stats.unconfigured === 0) return <>Every node has a run list or policy</>;
  const parts = [
    stats.emptyRunList > 0 && `${stats.emptyRunList} empty run list`,
    stats.defaultEnv > 0 && `${stats.defaultEnv} in _default`,
  ].filter(Boolean);
  return <>{parts.join(" · ")}</>;
}

type Chip = {
  key: string;
  label: string;
  tone: "success" | "danger" | "warn";
  icon: React.ReactNode;
};

/**
 * Every problem a node has, one chip each — the same diagnostics the stat
 * tiles count, so a node in a filtered list always shows why it's there.
 */
function statusChips(n: NodeSummary): Chip[] {
  const chips: Chip[] = [];
  if (n.missing) {
    chips.push({
      key: "missing",
      label: n.lastCheckIn === null ? "Never checked in" : "Missing",
      tone: "danger",
      icon: <IconWarning />,
    });
  }
  if (n.emptyRunList) {
    chips.push({ key: "runlist", label: "Empty run list", tone: "warn", icon: <IconQuestion /> });
  }
  if (n.defaultEnv) {
    chips.push({ key: "env", label: "_default env", tone: "warn", icon: <IconQuestion /> });
  }
  if (n.clientStatus === "eol") {
    chips.push({ key: "client", label: "EOL client", tone: "danger", icon: <IconWarning /> });
  } else if (n.clientStatus === "major-behind") {
    chips.push({ key: "client", label: "Client behind", tone: "warn", icon: <IconArrowDown /> });
  }
  return chips;
}

const CHIP_TONE = {
  success: "border-success text-success",
  danger: "border-danger text-danger",
  warn: "border-warn text-warn",
} as const;

/** Icon + text + border on each chip: severity is never carried by color alone. */
function StatusChips({ node }: { node: NodeSummary }) {
  const chips = statusChips(node);
  const shown: Chip[] =
    chips.length > 0
      ? chips
      : [{ key: "ok", label: "Healthy", tone: "success", icon: <IconCheck /> }];
  return (
    <ul className="flex flex-wrap gap-1">
      {shown.map((c) => (
        <li
          key={c.key}
          className={cn(
            "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded border px-1.5 text-xs leading-none",
            CHIP_TONE[c.tone],
          )}
        >
          <span aria-hidden="true">{c.icon}</span>
          {c.label}
        </li>
      ))}
    </ul>
  );
}

function platformText(n: NodeSummary): string | null {
  if (n.platform === null) return null;
  return n.platformVersion ? `${n.platform} ${n.platformVersion}` : n.platform;
}

// --- helpers -------------------------------------------------------------

// Filter by the same independent diagnostic flags the stat tiles count (not the
// snapshot's single-valued `status`), so a node that's both missing and
// unconfigured appears under either tile and the list matches the tile's number.
function filterNodes(nodes: DashboardNode[], filter: Filter): DashboardNode[] {
  if (filter === null) return nodes;
  if (filter === "recent") return nodes.filter((n) => n.recent);
  if (filter === "missing") return nodes.filter((n) => n.missing);
  if (filter === "unconfigured") return nodes.filter((n) => n.unconfigured);
  return nodes.filter(isOutdated);
}

function filterHeading(filter: Exclude<Filter, null>): string {
  return {
    recent: "Checked in within the hour",
    missing: "Missing nodes",
    unconfigured: "Unconfigured nodes",
    outdated: "Nodes with outdated clients",
  }[filter];
}

function explainError(error: string): string {
  if (error === "forbidden")
    return "You don't have permission to search nodes in this organization.";
  if (error === "not found") return "This organization has no node index.";
  return "The Cinc server returned an error refreshing the fleet.";
}

