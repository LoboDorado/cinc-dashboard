import { NextResponse } from "next/server";
import { requireAccountId, Unauthorized } from "@/lib/session";
import { searchFleetCompliance } from "@/lib/collector/compliance-search";

/**
 * Lazy-fetch endpoint for the fleet-wide Compliance page's search box --
 * fetched on submit, not polled. Mirrors app/(browse)/fleet/route.ts's
 * JSON-401 convention; unlike the per-node compliance route there's no
 * AccessDeniedError to catch, since searchFleetCompliance (via
 * requireObjectAccessMany) degrades per scope instead of throwing.
 */
export async function GET(req: Request) {
  let accountId: string;
  try {
    accountId = await requireAccountId();
  } catch (e) {
    if (e instanceof Unauthorized) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }
  const rawStatus = searchParams.get("status");
  const status =
    rawStatus === "passed" || rawStatus === "failed" || rawStatus === "skipped" ? rawStatus : undefined;

  const outcome = await searchFleetCompliance(accountId, { q, status });
  return NextResponse.json(outcome, { headers: { "Cache-Control": "no-store" } });
}
