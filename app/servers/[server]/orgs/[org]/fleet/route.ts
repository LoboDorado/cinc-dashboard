import { NextResponse } from "next/server";
import { requireAccountId, Unauthorized } from "@/lib/session";
import { requireObjectAccess, AccessDeniedError } from "@/lib/admin/access";
import { loadFleetSnapshot } from "@/lib/cinc/fleet-snapshot";
import { nowMs } from "@/lib/cinc/client";

/**
 * Poll endpoint for the org dashboard. The client fetches this every 10s to
 * refresh the node list (the stat tiles re-snapshot on a slower 60s cadence,
 * client-side, from the same response). Unlike a Server Component we return
 * JSON 401 (not a redirect to /login) so the client's fetch can react instead
 * of silently following a redirect to an HTML page.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ server: string; org: string }> },
) {
  const { server, org } = await params;

  let accountId: string;
  try {
    accountId = await requireAccountId();
  } catch (e) {
    if (e instanceof Unauthorized) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw e;
  }

  let res;
  try {
    const ctx = await requireObjectAccess(accountId, server, org, "nodes", "read");
    res = await loadFleetSnapshot(ctx, nowMs());
  } catch (e) {
    if (e instanceof AccessDeniedError) {
      // ACL/availability errors are part of normal operation (an account may
      // not be able to search this org); hand the reason to the client,
      // status 200, same as any other read error below.
      return NextResponse.json({ error: "forbidden" }, { status: 200 });
    }
    throw e;
  }

  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: 200 });
  }

  return NextResponse.json(res.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
