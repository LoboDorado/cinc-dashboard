import { TilesSkeleton, ListSkeleton } from "@/components/fleet-skeleton";

/**
 * Loading placeholder for the Compliance page's eager default fetch (up to
 * `DEFAULT_NODE_CAP` per-node round trips -- see lib/collector/compliance-overview.ts
 * -- so this can take a moment). Reuses the Fleet dashboard's own skeleton
 * pieces: a tile row stands in for the Overview tab's stats, a list stands in
 * for whichever row-based tab the account lands on.
 */
export function ComplianceSkeleton() {
  return (
    <div className="space-y-6">
      <p role="status" className="sr-only">
        Loading compliance data…
      </p>
      <TilesSkeleton />
      <ListSkeleton />
    </div>
  );
}
