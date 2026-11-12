import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { FleetDashboard } from "@/components/fleet-dashboard";
import { LeadingPreview } from "@/components/fleet-leading-preview";
import { DashboardSkeleton } from "@/components/fleet-skeleton";
import { currentAccountId } from "@/lib/guard";
import {
  resolveFleetAccess,
  loadAggregatedFleetSnapshot,
  fetchAggregatedFleetCounts,
  type FailedScope,
} from "@/lib/cinc/fleet-aggregate";
import { nowMs } from "@/lib/cinc/client";

/** The aggregated dashboard re-runs a full multi-org sweep on every poll, for
 *  however many orgs the account can reach -- 10s (fine for one org) would
 *  multiply that load across the fleet of registered servers for no benefit
 *  on what's a glanceable overview, not an incident-response surface. */
const AGGREGATED_LIST_POLL_MS = 30_000;

export default async function Dashboard() {
  const accountId = await currentAccountId();
  const now = nowMs();
  const { contexts, failedScopes: accessFailures } = await resolveFleetAccess(accountId);

  if (contexts.length === 0 && accessFailures.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Fleet" description="Across every server and organization you can reach" />
        <p className="text-muted">You don&apos;t have access to any registered Cinc Servers yet.</p>
      </div>
    );
  }

  // Kick both reads off WITHOUT awaiting so the page can stream in stages --
  // same two-tier pattern as the per-org dashboard, just fed by every
  // reachable scope's contexts instead of one.
  const countsPromise = fetchAggregatedFleetCounts(contexts, now);
  const snapshotPromise = loadAggregatedFleetSnapshot(contexts, now);

  return (
    <div className="space-y-6">
      <PageHeader title="Fleet" description="Across every server and organization you can reach" />
      <Suspense
        fallback={
          <Suspense fallback={<DashboardSkeleton />}>
            <LeadingPreviewWithFailures countsPromise={countsPromise} accessFailures={accessFailures} />
          </Suspense>
        }
      >
        <FullAggregatedDashboard snapshotPromise={snapshotPromise} accessFailures={accessFailures} />
      </Suspense>
    </div>
  );
}

/**
 * LeadingPreview is shared with the per-org dashboard and only knows about
 * FleetCounts, not failedScopes -- rather than growing that shared component
 * for this one caller, unwrap the aggregated result here and hand it a
 * resolved (already-awaited) promise, so its own `await countsPromise`
 * resolves instantly with no behavior change.
 */
async function LeadingPreviewWithFailures({
  countsPromise,
  accessFailures,
}: {
  countsPromise: ReturnType<typeof fetchAggregatedFleetCounts>;
  accessFailures: FailedScope[];
}) {
  const { counts, failedScopes } = await countsPromise;
  const allFailed = [...accessFailures, ...failedScopes];
  return (
    <div className="space-y-4">
      {allFailed.length > 0 && <FailedScopesNotice failedScopes={allFailed} />}
      <LeadingPreview countsPromise={Promise.resolve(counts)} />
    </div>
  );
}

/**
 * Awaits the heavy merged sweep, then hands off to the interactive client
 * dashboard (which owns the live polling). Its own async component so its
 * `await` is what the outer Suspense boundary suspends on.
 */
async function FullAggregatedDashboard({
  snapshotPromise,
  accessFailures,
}: {
  snapshotPromise: ReturnType<typeof loadAggregatedFleetSnapshot>;
  accessFailures: FailedScope[];
}) {
  const { snapshot, failedScopes } = await snapshotPromise;
  return (
    <FleetDashboard
      pollUrl="/fleet"
      listPollMs={AGGREGATED_LIST_POLL_MS}
      initial={snapshot}
      initialError={null}
      failedScopes={[...accessFailures, ...failedScopes]}
      showScopeColumns
    />
  );
}

function FailedScopesNotice({ failedScopes }: { failedScopes: FailedScope[] }) {
  return (
    <p role="alert" className="text-sm text-warn">
      Couldn&apos;t load {failedScopes.length} scope{failedScopes.length === 1 ? "" : "s"}:{" "}
      {failedScopes
        .map((f) => (f.org === "*" ? `${f.serverName} (${f.reason})` : `${f.serverName} / ${f.org} (${f.reason})`))
        .join("; ")}
    </p>
  );
}
