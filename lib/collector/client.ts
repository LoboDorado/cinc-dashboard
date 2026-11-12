// Server-only transport for a registered Cinc Collector.
//
// Unlike lib/cinc/client.ts (which signs every request with a registered
// server's webui key while impersonating its shared admin identity), a
// Collector call just carries a bearer token -- there's no per-request
// signing, and no AuthorizedActionContext-shaped brand to mint, because the
// real security boundary already happened one level up: a CollectorConnection
// is only reachable after a caller passed requireObjectAccess for the node's
// own (server, org) (see lib/collector/compliance.ts / node-fields.ts). A
// collector's bearer token is still a shared/service credential, like a
// registered server's webui key, so every call here is audited the same way
// cincRequest audits every Cinc Server call -- awaited, not fire-and-forget.
import "server-only";
import { Agent, fetch as undiciFetch } from "undici";
import { recordAudit } from "../db/audit";
import { CollectorError } from "./errors";
import type { CincPath } from "../cinc/path";

export type CollectorConnection = {
  collectorId: string;
  baseUrl: string;
  bearerToken: string;
  caCert?: string;
  tlsNoVerify: boolean;
};

/** Audit/attribution only -- NOT a security boundary (see module comment). */
export type CollectorAuditContext = {
  accountId: string;
  onBehalfOf: string;
  serverId?: string;
  org?: string;
};

// One undici Agent per registered collector, keyed by collectorId, same
// reasoning as lib/cinc/client.ts's dispatcher cache: each collector's own
// CA/TLS settings should apply only to requests against it. Uses undici's
// own fetch, not the global one, for the same version-consistency reason
// documented there (a dispatcher built from one undici version crashes
// against another version's fetch).
const dispatchers = new Map<string, Agent>();

function dispatcherFor(conn: CollectorConnection): Agent | undefined {
  if (!conn.tlsNoVerify && !conn.caCert) return undefined; // default agent is fine
  let agent = dispatchers.get(conn.collectorId);
  if (!agent) {
    agent = new Agent({ connect: { rejectUnauthorized: !conn.tlsNoVerify, ca: conn.caCert } });
    dispatchers.set(conn.collectorId, agent);
  }
  return agent;
}

export type CollectorRequestOptions = {
  method: string;
  /**
   * Reuses lib/cinc/path.ts's CincPath brand + cincPath tag. A node name or
   * report id ultimately comes from a route param the same way it does for a
   * Cinc Server call, so the same `/`, `\`, `..`-segment rejection discipline
   * applies even though nothing here gets signed.
   */
  path: CincPath;
  query?: Record<string, string | number>;
  /** e.g. "collector_compliance.list" -- see lib/db/audit.ts's existing <resource>.<verb> action-naming convention. */
  auditAction: string;
};

export async function collectorRequest<T>(
  conn: CollectorConnection,
  audit: CollectorAuditContext,
  opts: CollectorRequestOptions,
): Promise<T> {
  const qs = opts.query
    ? "?" +
      new URLSearchParams(
        Object.entries(opts.query).map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";

  const res = await undiciFetch(conn.baseUrl + opts.path + qs, {
    method: opts.method,
    headers: {
      Authorization: `Bearer ${conn.bearerToken}`,
      Accept: "application/json",
    },
    dispatcher: dispatcherFor(conn),
  });
  const text = await res.text();
  const parsed = text ? safeJson(text) : null;

  // Not fire-and-forget: a failed audit write fails the request, mirroring
  // cincRequest's discipline -- this is the only record of which dashboard
  // account actually read what through the collector's shared token.
  await recordAudit({
    actorAccountId: audit.accountId,
    actorUsername: audit.onBehalfOf,
    serverId: audit.serverId,
    org: audit.org,
    action: opts.auditAction,
    resourcePath: `collector:${conn.collectorId}${opts.path}`,
    outcome: res.ok ? "success" : "error",
    statusCode: res.status,
  });

  if (!res.ok) {
    throw new CollectorError(res.status, parsed ?? text);
  }
  return parsed as T;
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}
