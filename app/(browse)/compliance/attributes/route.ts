import { NextResponse } from "next/server";
import { requireAccountId, Unauthorized } from "@/lib/session";
import { requireObjectAccessMany } from "@/lib/admin/access";
import { loadCollectorNodeAttributes } from "@/lib/collector/node-fields";

type Pair = { serverId: string; serverName: string; org: string };

function parseScopes(raw: string | null): Pair[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > 50) return null;
  if (
    !parsed.every(
      (p): p is Pair =>
        p &&
        typeof p === "object" &&
        typeof (p as Pair).serverId === "string" &&
        typeof (p as Pair).serverName === "string" &&
        typeof (p as Pair).org === "string",
    )
  ) {
    return null;
  }
  return parsed;
}

/**
 * Lazy, on-demand node-attributes fetch for the fleet Compliance page's
 * "refine by attribute" input -- scoped to just the (server,org) pairs the
 * client already learned about from its own prior search results, never the
 * account's whole reachable fleet. Re-runs requireObjectAccessMany against
 * exactly those pairs rather than trusting the client-supplied scopes: a
 * tampered pair just gets filtered out of `contexts`, same as any other
 * access-degrade path in this app.
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
  const pairs = parseScopes(searchParams.get("scopes"));
  if (!pairs) {
    return NextResponse.json({ error: "invalid scopes" }, { status: 400 });
  }

  const { contexts } = await requireObjectAccessMany(
    accountId,
    pairs.map(({ serverId, org }) => ({ serverId, org })),
    "nodes",
    "read",
  );
  if (contexts.length === 0) {
    return NextResponse.json({ attributes: {} }, { headers: { "Cache-Control": "no-store" } });
  }

  const nameOf = new Map(pairs.map((p) => [p.serverId, p.serverName]));
  const result = await loadCollectorNodeAttributes(
    contexts.map(({ serverId, org }) => ({ serverId, org, serverName: nameOf.get(serverId) ?? serverId })),
    { accountId, onBehalfOf: contexts[0].ctx.onBehalfOf },
  );
  return NextResponse.json(
    { attributes: Object.fromEntries(result.attributesByKey) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
