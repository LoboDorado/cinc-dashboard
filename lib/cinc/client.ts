// Server-only transport for a registered Cinc Server.
//
// Every request is signed with that server's webui key while impersonating
// its configured shared admin identity (X-Ops-UserId + X-Ops-Request-Source:
// web), NOT the real dashboard account that triggered it -- see
// lib/admin/access.ts, whose AuthorizedActionContext is the only way to call
// this module. This module must never be imported into a Client Component —
// it holds decrypted webui keys.
import "server-only";
import { Agent, fetch as undiciFetch } from "undici";
import type { AuthorizedActionContext } from "../admin/access";
import { getConfig } from "../config";
import { recordAudit } from "../db/audit";
import { signHeaders } from "./signing";
import { CincError } from "./errors";
import {
  assertSafePath,
  assertSafeSegment,
  isUnsafePathError,
  type CincPath,
} from "./path";
import { log } from "../log";

// One undici Agent per registered server, keyed by serverId, so each server's
// own CA/TLS settings apply only to requests against it -- a single global
// dispatcher (the pre-multi-server design) can't express that. Agents are
// cheap to keep around for the life of the process; there's no eviction
// because registered servers are expected to number in the dozens, not
// thousands.
//
// Requests below use undici's own `fetch`, not the global one: Node's
// built-in fetch is backed by whatever undici version ships inside that
// Node release, which can differ from this project's own `undici`
// dependency. Handing a `dispatcher` built from one version to the other's
// fetch crashes deep inside undici's request-handler validation
// (`InvalidArgumentError: invalid onRequestStart method`) -- using undici's
// fetch keeps the Agent and the fetch implementation on the same version.
const dispatchers = new Map<string, Agent>();

function dispatcherFor(ctx: AuthorizedActionContext): Agent | undefined {
  if (!ctx.sslNoVerify && !ctx.caCert) return undefined; // default agent is fine
  let agent = dispatchers.get(ctx.serverId);
  if (!agent) {
    agent = new Agent({ connect: { rejectUnauthorized: !ctx.sslNoVerify, ca: ctx.caCert } });
    dispatchers.set(ctx.serverId, agent);
  }
  return agent;
}

/** ISO-8601 UTC with no fractional seconds, e.g. 2024-01-01T00:00:00Z. */
export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

/**
 * Current unix milliseconds. Indirecting through a helper keeps the impure
 * `Date.now()` out of Server Component render bodies (the react-hooks/purity
 * lint rule) while reading as exactly what it is at call sites.
 */
export function nowMs(): number {
  return Date.now();
}

export type CincRequestOptions = {
  method: string;
  /**
   * Built with the `cincPath` tagged template, which vets each interpolated name
   * as a single path segment. The type is branded, so a plain string won't
   * compile — see path.ts for why concatenating first is not good enough.
   */
  path: CincPath;
  body?: unknown;
  /**
   * Query parameters appended to the request URL. Kept SEPARATE from `path`
   * because Chef's v1.3 signing canonicalizes the path only — the query string
   * is never signed. Folding it into `path` would sign bytes the server can't
   * reproduce and every request would 401. Used by partial search (`?q=...`).
   */
  query?: Record<string, string | number>;
};

export async function cincRequest<T>(
  ctx: AuthorizedActionContext,
  opts: CincRequestOptions,
): Promise<T> {
  const fullPath = ctx.org ? `/organizations/${ctx.org}${opts.path}` : opts.path;
  // `path` is already vetted segment-by-segment by its `cincPath` tag. The two
  // values spliced in here are not, so vet them the same way BEFORE signing:
  // the org slug ultimately comes from a route param (where Next decodes
  // `%2F` into a real separator), and the impersonated user id also lands in a
  // request header, where a CR/LF would be header injection. See path.ts.
  try {
    assertSafeSegment(ctx.impersonationUsername, "user");
    if (ctx.org !== undefined) assertSafeSegment(ctx.org, "org");
    assertSafePath(fullPath);
  } catch (e) {
    if (isUnsafePathError(e)) {
      log.warn("cinc.unsafe_path", {
        actor: ctx.impersonationUsername,
        user: ctx.onBehalfOf,
        org: ctx.org,
        method: opts.method,
        path: fullPath,
        detail: e.detail,
      });
    }
    throw e;
  }
  const bodyStr = opts.body === undefined ? "" : JSON.stringify(opts.body);
  const headers: Record<string, string> = {
    ...signHeaders(
      {
        method: opts.method,
        path: fullPath,
        body: bodyStr,
        userId: ctx.impersonationUsername,
        timestamp: nowIso(),
      },
      ctx.webuiKey,
    ),
    "X-Ops-Request-Source": "web",
    "X-Chef-Version": getConfig().chefVersion,
    Accept: "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  // Query string lives on the URL only, never in the signed `fullPath` above.
  const qs = opts.query
    ? "?" +
      new URLSearchParams(
        Object.entries(opts.query).map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";

  const res = await undiciFetch(ctx.serverUrl + fullPath + qs, {
    method: opts.method,
    headers,
    body: opts.body === undefined ? undefined : bodyStr,
    dispatcher: dispatcherFor(ctx),
  });
  const text = await res.text();
  const parsed = text ? safeJson(text) : null;

  // Not fire-and-forget: a failed audit write fails the request, since this
  // is the only record of who (really) did what through the shared
  // impersonation identity -- see lib/db/audit.ts.
  await recordAudit({
    actorAccountId: ctx.accountId,
    actorUsername: ctx.onBehalfOf,
    serverId: ctx.serverId,
    org: ctx.org,
    action: opts.method,
    resourcePath: fullPath,
    outcome: res.ok ? "success" : "error",
    statusCode: res.status,
  });

  if (!res.ok) {
    // Identifiers only — never the body (data bag items hold secrets) or
    // headers (they carry the signature). `actor` is the shared identity
    // that signed the request; `user` is the real dashboard account it was
    // for.
    log[res.status >= 500 ? "error" : "warn"]("cinc.request_failed", {
      actor: ctx.impersonationUsername,
      user: ctx.onBehalfOf,
      org: ctx.org,
      method: opts.method,
      path: fullPath,
      status: res.status,
    });
    throw new CincError(res.status, parsed ?? text);
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
