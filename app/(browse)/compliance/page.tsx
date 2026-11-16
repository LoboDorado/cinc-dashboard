import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { FleetComplianceSearch } from "@/components/compliance/fleet-compliance-search";
import { ComplianceSkeleton } from "@/components/compliance/compliance-skeleton";
import { currentAccountId } from "@/lib/guard";
import { listReachableScopes } from "@/lib/admin/access";
import { anyCollectorRegistered } from "@/lib/admin/collectors";
import { loadDefaultFleetComplianceOverview } from "@/lib/collector/compliance-overview";

export default async function CompliancePage() {
  const accountId = await currentAccountId();
  const { scopes } = await listReachableScopes(accountId);

  if (scopes.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compliance" description="Across every server and organization you can reach" />
        <p className="text-muted">You don&apos;t have access to any registered Cinc Servers yet.</p>
      </div>
    );
  }

  const hasCollector = await anyCollectorRegistered([...new Set(scopes.map((s) => s.serverId))]);

  if (!hasCollector) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compliance" description="Across every server and organization you can reach" />
        <FleetComplianceSearch hasCollector={false} initialOverview={null} />
      </div>
    );
  }

  // Fired without awaiting so the page shell can stream in immediately --
  // same two-tier pattern app/(browse)/page.tsx uses for its own aggregated
  // sweep; the per-node round trips this does (see compliance-overview.ts)
  // can take a moment, and there's no reason to block the header on it.
  const overviewPromise = loadDefaultFleetComplianceOverview(accountId);

  return (
    <div className="space-y-6">
      <PageHeader title="Compliance" description="Across every server and organization you can reach" />
      <Suspense fallback={<ComplianceSkeleton />}>
        <ComplianceWithOverview overviewPromise={overviewPromise} />
      </Suspense>
    </div>
  );
}

/**
 * Its own async component so its `await` is what the outer Suspense boundary
 * suspends on, mirroring app/(browse)/page.tsx's FullAggregatedDashboard.
 */
async function ComplianceWithOverview({
  overviewPromise,
}: {
  overviewPromise: ReturnType<typeof loadDefaultFleetComplianceOverview>;
}) {
  const overview = await overviewPromise;
  return (
    <FleetComplianceSearch
      hasCollector
      initialOverview={overview.state === "overview" ? overview : null}
    />
  );
}
