import { TILE_GRID, TILE_BOX } from "@/components/fleet-skeleton";
import { EmptyState } from "@/components/details/primitives";
import type { OverviewStats } from "@/lib/collector/compliance-aggregate";

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className={TILE_BOX}>
      <span className="text-sm font-medium text-text">{label}</span>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-text">{value}</p>
    </div>
  );
}

/** Read-only stat tiles -- unlike the Fleet dashboard's StatTile, these don't
 *  double as filter toggles, so they're plain divs, not buttons. */
export function OverviewTab({ stats }: { stats: OverviewStats }) {
  return (
    <div className="space-y-6">
      <div className={TILE_GRID}>
        <Tile label="Nodes" value={stats.totalNodes} />
        <Tile label="Reports" value={stats.totalReports} />
        <Tile label="Controls passed" value={stats.controlsPassed} />
        <Tile label="Controls failed" value={stats.controlsFailed} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Top failing controls
          </h3>
          {stats.topFailingControls.length === 0 ? (
            <EmptyState>No failing controls in this view.</EmptyState>
          ) : (
            <ol className="space-y-1">
              {stats.topFailingControls.map((c) => (
                <li key={c.id} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-mono text-xs text-text">{c.title ?? c.id}</span>
                  <span className="shrink-0 text-muted">{c.failCount} node{c.failCount === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Top failing profiles
          </h3>
          {stats.topFailingProfiles.length === 0 ? (
            <EmptyState>No failing profiles in this view.</EmptyState>
          ) : (
            <ol className="space-y-1">
              {stats.topFailingProfiles.map((p) => (
                <li key={p.name} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-text">{p.title ?? p.name}</span>
                  <span className="shrink-0 text-muted">{p.failCount} node{p.failCount === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
