import { NextResponse } from "next/server";
import { requireAccountId, Unauthorized } from "@/lib/session";
import { resolveFleetAccess, loadAggregatedFleetSnapshot } from "@/lib/cinc/fleet-aggregate";
import { nowMs } from "@/lib/cinc/client";

/**
 * Poll endpoint for the aggregated dashboard (see app/(browse)/page.tsx for
 * the poll cadence rationale). Unlike the per-org poll route, there's no
 * single-scope AccessDeniedError to catch -- resolveFleetAccess/
 * loadAggregatedFleetSnapshot degrade per scope into `failedScopes` instead
 * of throwing.
 */
export async function GET() {
  let accountId: string;
  try {
    accountId = await requireAccountId();
  } catch (e) {
    if (e instanceof Unauthorized) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw e;
  }

  const { contexts, failedScopes: accessFailures } = await resolveFleetAccess(accountId);
  const { snapshot, failedScopes } = await loadAggregatedFleetSnapshot(contexts, nowMs());

  return NextResponse.json(
    { ...snapshot, failedScopes: [...accessFailures, ...failedScopes] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
