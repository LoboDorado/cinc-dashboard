import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { FleetDashboard } from "@/components/fleet-dashboard";
import { LeadingPreview } from "@/components/fleet-leading-preview";
import { DashboardSkeleton } from "@/components/fleet-skeleton";
import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { loadFleetSnapshot } from "@/lib/cinc/fleet-snapshot";
import { fetchFleetCounts } from "@/lib/cinc/fleet-counts";
import { nowMs } from "@/lib/cinc/client";

export default async function OrgDashboard({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  const accountId = await currentAccountId();
  const now = nowMs();
  const ctxRes = await safeGet(() => requireObjectAccess(accountId, server, org, "nodes", "read"));
  if ("error" in ctxRes) {
    return (
      <div className="space-y-6">
        <PageHeader title={org} description="Fleet overview" />
        <p className="text-sm text-danger">{explainRead(ctxRes.error)}</p>
      </div>
    );
  }
  const ctx = ctxRes.data;

  // Kick both reads off WITHOUT awaiting so the page can stream in stages:
  //  - `fetchFleetCounts` is cheap (rows=0 counts) and paints the Missing /
  //    Unconfigured tiles fast.
  //  - `loadFleetSnapshot` is the heavy field-by-field sweep that feeds the node
  //    list and the Outdated tile.
  // The header renders instantly; the Suspense boundary streams the leading
  // preview (fast counts) and then swaps in the full interactive dashboard when
  // the sweep resolves. Under load the page is responsive immediately instead of
  // blocking on one slow request.
  const countsPromise = fetchFleetCounts(ctx, now);
  const snapshotPromise = loadFleetSnapshot(ctx, now);

  return (
    <div className="space-y-6">
      <PageHeader title={org} description="Fleet overview" />
      <Suspense
        fallback={
          <Suspense fallback={<DashboardSkeleton />}>
            <LeadingPreview countsPromise={countsPromise} />
          </Suspense>
        }
      >
        <FullDashboard server={server} org={org} snapshotPromise={snapshotPromise} />
      </Suspense>
    </div>
  );
}

/**
 * Awaits the heavy snapshot, then hands off to the interactive client dashboard
 * (which owns the live polling). Kept as its own async component so its `await`
 * is what the outer Suspense boundary suspends on — letting the leading preview
 * show in the meantime.
 */
async function FullDashboard({
  server,
  org,
  snapshotPromise,
}: {
  server: string;
  org: string;
  snapshotPromise: ReturnType<typeof loadFleetSnapshot>;
}) {
  const res = await snapshotPromise;
  const initial = "error" in res ? null : res.data;
  const initialError = "error" in res ? explainRead(res.error) : null;
  return (
    <FleetDashboard server={server} org={org} initial={initial} initialError={initialError} />
  );
}
