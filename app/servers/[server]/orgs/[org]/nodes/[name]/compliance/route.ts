import { NextResponse } from "next/server";
import { requireAccountId, Unauthorized } from "@/lib/session";
import { AccessDeniedError } from "@/lib/admin/access";
import { loadNodeCompliance } from "@/lib/collector/compliance";

/**
 * Lazy-fetch endpoint for the node detail page's Compliance tab -- fetched
 * once, the first time that tab becomes active (see NodeComplianceTab), not
 * polled. Mirrors app/servers/[server]/orgs/[org]/fleet/route.ts's JSON-401/
 * soft-200-forbidden conventions.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ server: string; org: string; name: string }> },
) {
  const { server, org, name: raw } = await params;
  const name = decodeURIComponent(raw);

  let accountId: string;
  try {
    accountId = await requireAccountId();
  } catch (e) {
    if (e instanceof Unauthorized) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw e;
  }

  let result;
  try {
    result = await loadNodeCompliance(accountId, server, org, name);
  } catch (e) {
    if (e instanceof AccessDeniedError) {
      return NextResponse.json({ state: "forbidden" }, { status: 200 });
    }
    throw e;
  }

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
