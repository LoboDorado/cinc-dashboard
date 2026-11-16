"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button, buttonClass } from "@/components/ui/button";
import { FacetSelect } from "@/components/ui/facet-select";
import { Tabs, TabPanel, useTabParam } from "@/components/ui/tabs";
import { OverviewTab } from "@/components/compliance/overview-tab";
import { NodesTab } from "@/components/compliance/nodes-tab";
import { ProfilesTab } from "@/components/compliance/profiles-tab";
import { ControlsTab } from "@/components/compliance/controls-tab";
import { toExportRows, toCsv, toJson } from "@/lib/collector/export";
import {
  computeOverviewStats,
  computeNodeRows,
  computeProfileRows,
  computeControlRows,
} from "@/lib/collector/compliance-aggregate";
import type { FleetComplianceResult, FleetComplianceSearchOutcome } from "@/lib/collector/compliance-search";
import type { FleetComplianceOverview } from "@/lib/collector/compliance-overview";

type ResultsOutcome = Extract<FleetComplianceSearchOutcome, { state: "results" }>;

type FetchState = { kind: "idle" } | { kind: "loading" } | { kind: "fetch_error" } | { kind: "no_collector" };

type RefineState = { tagContains: string; attributeContains: string };

type AttrState =
  | { kind: "not_loaded" }
  | { kind: "loading" }
  | { kind: "loaded"; byKey: Map<string, unknown> }
  | { kind: "error" };

const TAB_IDS = ["overview", "nodes", "profiles", "controls"] as const;

/**
 * Pure refinement predicate, exported for its own unit test. Both checks are
 * plain substring scans over whatever's already in hand (profiles already
 * carried on the result; attributes fetched lazily into `attributesByKey`) --
 * never a second fleet search.
 */
export function matchesRefinement(
  result: FleetComplianceResult,
  refine: RefineState,
  attributesByKey: Map<string, unknown> | null,
): boolean {
  const tagNeedle = refine.tagContains.trim().toLowerCase();
  if (tagNeedle && !JSON.stringify(result.profiles).toLowerCase().includes(tagNeedle)) {
    return false;
  }
  const attrNeedle = refine.attributeContains.trim().toLowerCase();
  if (attrNeedle) {
    const key = `${result.serverId}::${result.org}::${result.nodeName}`;
    const attrs = attributesByKey?.get(key) ?? null;
    if (!JSON.stringify(attrs).toLowerCase().includes(attrNeedle)) return false;
  }
  return true;
}

function downloadText(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Fleet-wide Compliance browse/search/export page. The working set is
 * always populated -- `initialOverview`'s "current compliance posture of the
 * fleet" fetch (lib/collector/compliance-overview.ts) by default, swapped
 * for live search results (lib/collector/compliance-search.ts, which DOES
 * require a non-empty query server-side) only once the user actually
 * searches. "Filters" (tag/attribute) narrow whichever working set is
 * active; they're a client-side scan of data already in hand, never a second
 * fleet search -- see matchesRefinement. Overview/Nodes/Profiles/Controls
 * are pure views over the filtered working set: switching tabs never fetches.
 */
export function FleetComplianceSearch({
  hasCollector,
  initialOverview,
}: {
  hasCollector: boolean;
  initialOverview: FleetComplianceOverview | null;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState<"default" | "search">("default");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchOutcome, setSearchOutcome] = useState<ResultsOutcome | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>({ kind: "idle" });
  const [refine, setRefine] = useState<RefineState>({ tagContains: "", attributeContains: "" });
  const [attrState, setAttrState] = useState<AttrState>({ kind: "not_loaded" });
  const attrRequestedRef = useRef(false);
  const [activeTab, setActiveTab] = useTabParam("tab", "overview", TAB_IDS);

  const results = useMemo(
    () => (source === "search" ? (searchOutcome?.results ?? []) : (initialOverview?.results ?? [])),
    [source, searchOutcome, initialOverview],
  );
  const attributesByKey = attrState.kind === "loaded" ? attrState.byKey : null;
  const filtered = useMemo(
    () => results.filter((r) => matchesRefinement(r, refine, attributesByKey)),
    [results, refine, attributesByKey],
  );

  const overviewStats = useMemo(() => computeOverviewStats(filtered), [filtered]);
  const nodeRows = useMemo(() => computeNodeRows(filtered), [filtered]);
  const profileRows = useMemo(() => computeProfileRows(filtered), [filtered]);
  const controlRows = useMemo(() => computeControlRows(filtered), [filtered]);

  if (!hasCollector) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">
          No collector is registered for any server you can reach yet. InSpec
          compliance scans are stored by a Cinc Collector, not the Cinc Server
          itself.
        </p>
        <Link href="/admin/collectors/new" className={buttonClass("secondary")}>
          Register a collector
        </Link>
      </div>
    );
  }

  function resetFilters() {
    setRefine({ tagContains: "", attributeContains: "" });
    setAttrState({ kind: "not_loaded" });
    attrRequestedRef.current = false;
  }

  function runSearch(e: FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    setFetchState({ kind: "loading" });

    const params = new URLSearchParams({ q: trimmed });
    if (status) params.set("status", status);
    fetch(`/compliance/search?${params.toString()}`)
      .then((res) => res.json())
      .then((outcome: FleetComplianceSearchOutcome) => {
        if (outcome.state === "no_collector") {
          setFetchState({ kind: "no_collector" });
          return;
        }
        setSource("search");
        setSubmittedQuery(trimmed);
        setSearchOutcome(outcome);
        setFetchState({ kind: "idle" });
        resetFilters();
      })
      .catch(() => setFetchState({ kind: "fetch_error" }));
  }

  function clearSearch() {
    setQ("");
    setStatus("");
    setSource("default");
    setSearchOutcome(null);
    setSubmittedQuery("");
    setFetchState({ kind: "idle" });
    resetFilters();
  }

  function onAttributeContainsChange(value: string) {
    setRefine((r) => ({ ...r, attributeContains: value }));
    if (attrRequestedRef.current || value.trim() === "") return;
    attrRequestedRef.current = true;
    setAttrState({ kind: "loading" });

    const scopeByKey = new Map<string, { serverId: string; serverName: string; org: string }>();
    for (const r of results) {
      scopeByKey.set(`${r.serverId}::${r.org}`, { serverId: r.serverId, serverName: r.serverName, org: r.org });
    }
    fetch(`/compliance/attributes?scopes=${encodeURIComponent(JSON.stringify([...scopeByKey.values()]))}`)
      .then((res) => res.json())
      .then((body: { attributes: Record<string, unknown> }) => {
        setAttrState({ kind: "loaded", byKey: new Map(Object.entries(body.attributes)) });
      })
      .catch(() => setAttrState({ kind: "error" }));
  }

  function exportResults(format: "csv" | "json") {
    const rows = toExportRows(filtered);
    if (format === "csv") downloadText(toCsv(rows), "compliance-export.csv", "text/csv");
    else downloadText(toJson(rows), "compliance-export.json", "application/json");
  }

  const canClear = source === "search" || q !== "";
  const activeFailedScopes = source === "search" ? (searchOutcome?.failedScopes ?? []) : (initialOverview?.failedScopes ?? []);

  return (
    <div className="space-y-6">
      <form onSubmit={runSearch} className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="compliance-q" className="block text-sm text-muted">
              Search
            </label>
            <Input
              id="compliance-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-describedby="compliance-q-help"
              className="w-full sm:max-w-sm"
            />
          </div>
          <FacetSelect
            label="Status"
            value={status}
            options={[
              { value: "passed", label: "Passed" },
              { value: "failed", label: "Failed" },
              { value: "skipped", label: "Skipped" },
            ]}
            onChange={setStatus}
          />
          <Button type="submit" disabled={!q.trim()}>
            Search
          </Button>
          <Button type="button" variant="secondary" disabled={!canClear} onClick={clearSearch}>
            Clear
          </Button>

          <div className="ml-auto space-y-1">
            <label htmlFor="compliance-tag" className="block text-sm text-muted">
              Filter by tag
            </label>
            <Input
              id="compliance-tag"
              value={refine.tagContains}
              onChange={(e) => setRefine((r) => ({ ...r, tagContains: e.target.value }))}
              className="w-full sm:max-w-xs"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="compliance-attr" className="block text-sm text-muted">
              Filter by node attributes
            </label>
            <Input
              id="compliance-attr"
              value={refine.attributeContains}
              onChange={(e) => onAttributeContainsChange(e.target.value)}
              className="w-full sm:max-w-xs"
            />
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" disabled={filtered.length === 0} onClick={() => exportResults("csv")}>
              Export CSV
            </Button>
            <Button variant="secondary" disabled={filtered.length === 0} onClick={() => exportResults("json")}>
              Export JSON
            </Button>
          </div>
        </div>
        <p id="compliance-q-help" className="text-xs text-muted">
          Searching looks across node names, profile/control titles,
          descriptions, and failure messages together as one query, replacing
          the view below with the results. &ldquo;Filter by tag&rdquo; and
          &ldquo;Filter by node attributes&rdquo; only narrow what&apos;s
          already shown -- they don&apos;t search the fleet again.
        </p>
      </form>

      {fetchState.kind === "loading" && (
        <p aria-live="polite" className="text-sm text-muted">
          Searching…
        </p>
      )}
      {fetchState.kind === "fetch_error" && (
        <p role="alert" className="text-sm text-danger">
          Couldn&apos;t run that search. Try again.
        </p>
      )}
      {fetchState.kind === "no_collector" && (
        <p className="text-sm text-muted">No collector was available to search.</p>
      )}
      {attrState.kind === "error" && (
        <p role="alert" className="text-sm text-danger">
          Couldn&apos;t load node attributes to filter by.
        </p>
      )}

      {source === "default" && initialOverview && (
        <p className="text-sm text-muted">
          Current compliance posture across {initialOverview.nodesConsidered} node
          {initialOverview.nodesConsidered === 1 ? "" : "s"}.
          {initialOverview.truncated &&
            ` Showing the first ${initialOverview.nodesConsidered} of ${initialOverview.totalReachableNodes} reachable nodes -- search to narrow further.`}
        </p>
      )}
      {source === "search" && searchOutcome && (
        <p className="text-sm text-muted">
          Showing up to {searchOutcome.limitPerCollector * searchOutcome.queriedCollectors} results across{" "}
          {searchOutcome.queriedCollectors} collector{searchOutcome.queriedCollectors === 1 ? "" : "s"} for &ldquo;
          {submittedQuery}&rdquo;.
        </p>
      )}
      {activeFailedScopes.length > 0 && (
        <p role="alert" className="text-sm text-warn">
          Couldn&apos;t reach {activeFailedScopes.length} collector{activeFailedScopes.length === 1 ? "" : "s"}:{" "}
          {activeFailedScopes.map((f) => `${f.serverName} (${f.reason})`).join("; ")}
        </p>
      )}

      <div className="space-y-4">
        <Tabs
          id="compliance-tabs"
          label="Compliance views"
          activeId={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "nodes", label: "Nodes" },
            { id: "profiles", label: "Profiles" },
            { id: "controls", label: "Controls" },
          ]}
        />
        <TabPanel id="compliance-tabs" tabId="overview" activeId={activeTab}>
          <OverviewTab stats={overviewStats} />
        </TabPanel>
        <TabPanel id="compliance-tabs" tabId="nodes" activeId={activeTab}>
          <NodesTab rows={nodeRows} />
        </TabPanel>
        <TabPanel id="compliance-tabs" tabId="profiles" activeId={activeTab}>
          <ProfilesTab rows={profileRows} />
        </TabPanel>
        <TabPanel id="compliance-tabs" tabId="controls" activeId={activeTab}>
          <ControlsTab rows={controlRows} />
        </TabPanel>
      </div>
    </div>
  );
}
