// The authorization chokepoint: every signed request to a registered Cinc
// Server must obtain an AuthorizedActionContext from here first. The type is
// branded with a module-private symbol, so a plain object literal doesn't
// structurally match it -- nothing outside this file can fabricate one
// without a conspicuous `as AuthorizedActionContext` cast, mirroring
// lib/cinc/path.ts's CincPath brand.
import "server-only";
import { getPool } from "../db/client";
import { decrypt } from "../db/secretbox";
import { recordAudit } from "../db/audit";
import { listAllOrgs, type Org } from "../cinc/orgs";
import { isCincError } from "../cinc/errors";
import {
  canAccessObject,
  canAccessScope,
  canViewAssignments,
  isPlatformAdmin,
  isPlatformMember,
  isScopeAdmin,
  type Action,
  type ObjectType,
  type RoleGrant,
} from "./policy";

const brand = Symbol("AuthorizedActionContext");

export type AuthorizedActionContext = {
  serverId: string;
  serverUrl: string;
  webuiKey: string;
  caCert?: string;
  sslNoVerify: boolean;
  impersonationUsername: string;
  accountId: string;
  /** The real dashboard account's username -- audit/log attribution only, never signed. */
  onBehalfOf: string;
  org?: string;
} & { readonly [brand]: true };

export class AccessDeniedError extends Error {
  constructor() {
    super("access denied");
    this.name = "AccessDeniedError";
  }
}

type GrantRow = {
  role: RoleGrant["role"];
  server_id: string | null;
  org: string | null;
  object_types: string[] | null;
};

/** Exported for lib/admin/grants.ts, which needs a granter's own grants to compute `grantableRoles`. */
export async function loadGrants(accountId: string): Promise<RoleGrant[]> {
  const { rows } = await getPool().query<GrantRow>(
    `SELECT g.role, g.server_id, g.org,
            array_remove(array_agg(ot.object_type), NULL) AS object_types
     FROM role_grants g
     LEFT JOIN role_grant_object_types ot ON ot.role_grant_id = g.id
     WHERE g.dashboard_account_id = $1
     GROUP BY g.id`,
    [accountId],
  );
  return rows.map((r) => ({
    role: r.role,
    serverId: r.server_id,
    org: r.org,
    objectTypes: (r.object_types ?? []) as ObjectType[],
  }));
}

type ServerRow = {
  id: string;
  name: string;
  base_url: string;
  ca_cert: string | null;
  webui_key_encrypted: Buffer;
  impersonation_username: string;
  tls_no_verify: boolean;
};

async function loadServer(serverId: string): Promise<ServerRow | null> {
  const { rows } = await getPool().query<ServerRow>(
    `SELECT id, name, base_url, ca_cert, webui_key_encrypted, impersonation_username, tls_no_verify
     FROM registered_servers WHERE id = $1`,
    [serverId],
  );
  return rows[0] ?? null;
}

/** Batched sibling of `loadServer`, for minting many contexts at once without
 *  one query per (server, org) pair -- several orgs commonly share one server. */
async function loadServers(ids: readonly string[]): Promise<ServerRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await getPool().query<ServerRow>(
    `SELECT id, name, base_url, ca_cert, webui_key_encrypted, impersonation_username, tls_no_verify
     FROM registered_servers WHERE id = ANY($1)`,
    [ids],
  );
  return rows;
}

type AccountRow = { id: string; username: string };

async function loadAccount(accountId: string): Promise<AccountRow | null> {
  const { rows } = await getPool().query<AccountRow>(
    "SELECT id, username FROM dashboard_accounts WHERE id = $1",
    [accountId],
  );
  return rows[0] ?? null;
}

/**
 * The only way to produce an `AuthorizedActionContext`. Denies (and audits
 * the denial) unless `accountId` holds a role grant that permits `action` on
 * `objectType` within `org` on `serverId` -- see lib/admin/policy.ts for the
 * decision logic itself.
 */
export async function requireObjectAccess(
  accountId: string,
  serverId: string,
  org: string,
  objectType: ObjectType,
  action: Action,
): Promise<AuthorizedActionContext> {
  const [grants, server, account] = await Promise.all([
    loadGrants(accountId),
    loadServer(serverId),
    loadAccount(accountId),
  ]);

  const allowed = server !== null && account !== null && canAccessObject(grants, serverId, org, objectType, action);
  if (!allowed) {
    await recordAudit({
      actorAccountId: accountId,
      actorUsername: account?.username ?? accountId,
      serverId,
      serverName: server?.name,
      org,
      action: `${action}:${objectType}`,
      outcome: "denied",
    });
    throw new AccessDeniedError();
  }

  return {
    serverId: server.id,
    serverUrl: server.base_url,
    webuiKey: decrypt(server.webui_key_encrypted),
    caCert: server.ca_cert ?? undefined,
    sslNoVerify: server.tls_no_verify,
    impersonationUsername: server.impersonation_username,
    accountId: account.id,
    onBehalfOf: account.username,
    org,
    [brand]: true,
  } as AuthorizedActionContext;
}

/**
 * A lighter check with no object type: true if `accountId` can see
 * `serverId` (and `org`, if given) at all. Used for navigation (server/org
 * pickers) -- never as the gate for an actual object read/write, which must
 * go through `requireObjectAccess`.
 */
export async function requireScopeAccess(
  accountId: string,
  serverId: string,
  org?: string,
): Promise<boolean> {
  const grants = await loadGrants(accountId);
  return canAccessScope(grants, serverId, org);
}

/**
 * A context for server-wide, non-object calls (e.g. listing an org's
 * existence via GET /organizations to populate a picker) -- gated by
 * `canAccessScope` rather than a specific object type/action. The returned
 * context has no `org` set.
 */
export async function requireServerAccess(
  accountId: string,
  serverId: string,
): Promise<AuthorizedActionContext> {
  return requireScopeContext(accountId, serverId, undefined, "server_access");
}

/**
 * A context for org-wide, non-object calls that any grant covering the org
 * may make (e.g. reading the Members/Groups lists -- viewing who's in an org
 * isn't gated by a configurable object type the way nodes/roles/etc. are;
 * only *managing* members/groups is, via `requireScopeAdmin`).
 */
export async function requireOrgAccess(
  accountId: string,
  serverId: string,
  org: string,
): Promise<AuthorizedActionContext> {
  return requireScopeContext(accountId, serverId, org, "org_access");
}

async function requireScopeContext(
  accountId: string,
  serverId: string,
  org: string | undefined,
  auditAction: string,
): Promise<AuthorizedActionContext> {
  const [grants, server, account] = await Promise.all([
    loadGrants(accountId),
    loadServer(serverId),
    loadAccount(accountId),
  ]);

  const allowed = server !== null && account !== null && canAccessScope(grants, serverId, org);
  if (!allowed) {
    await recordAudit({
      actorAccountId: accountId,
      actorUsername: account?.username ?? accountId,
      serverId,
      serverName: server?.name,
      org,
      action: auditAction,
      outcome: "denied",
    });
    throw new AccessDeniedError();
  }

  return {
    serverId: server.id,
    serverUrl: server.base_url,
    webuiKey: decrypt(server.webui_key_encrypted),
    caCert: server.ca_cert ?? undefined,
    sslNoVerify: server.tls_no_verify,
    impersonationUsername: server.impersonation_username,
    accountId: account.id,
    onBehalfOf: account.username,
    org,
    [brand]: true,
  } as AuthorizedActionContext;
}

/**
 * Like `requireObjectAccess`, but for Members/Groups management -- gated by
 * admin tier (`isScopeAdmin`) rather than a configurable Object Manager type,
 * since groups are deliberately not delegable that way (see the RBAC model).
 */
export async function requireScopeAdmin(
  accountId: string,
  serverId: string,
  org: string,
): Promise<AuthorizedActionContext> {
  const [grants, server, account] = await Promise.all([
    loadGrants(accountId),
    loadServer(serverId),
    loadAccount(accountId),
  ]);

  const allowed = server !== null && account !== null && isScopeAdmin(grants, serverId, org);
  if (!allowed) {
    await recordAudit({
      actorAccountId: accountId,
      actorUsername: account?.username ?? accountId,
      serverId,
      serverName: server?.name,
      org,
      action: "admin:members",
      outcome: "denied",
    });
    throw new AccessDeniedError();
  }

  return {
    serverId: server.id,
    serverUrl: server.base_url,
    webuiKey: decrypt(server.webui_key_encrypted),
    caCert: server.ca_cert ?? undefined,
    sslNoVerify: server.tls_no_verify,
    impersonationUsername: server.impersonation_username,
    accountId: account.id,
    onBehalfOf: account.username,
    org,
    [brand]: true,
  } as AuthorizedActionContext;
}

/**
 * True if `accountId` can reach the delegated role-grant admin surface for
 * `serverId` (and `org`, if given) -- a Platform Admin, that server's own
 * Server Admin, or (when `org` is given) that org's own Org Admin. This only
 * gates whether the surface renders; `lib/admin/grants.ts`'s `grantableRoles`
 * check is what actually caps which roles it can hand out there.
 */
export async function canManageRoleGrants(
  accountId: string,
  serverId: string,
  org?: string,
): Promise<boolean> {
  return canViewAssignments(await loadGrants(accountId), serverId, org);
}

/** True if `accountId` can see (but not necessarily change) the platform admin area. */
export async function isPlatformMemberAccount(accountId: string): Promise<boolean> {
  return isPlatformMember(await loadGrants(accountId));
}

/** True if `accountId` can make changes in the platform admin area. */
export async function isPlatformAdminAccount(accountId: string): Promise<boolean> {
  return isPlatformAdmin(await loadGrants(accountId));
}

/** Throws AccessDeniedError (and audits the denial) unless `accountId` is platform_admin or platform_read_only. */
export async function requirePlatformMember(accountId: string): Promise<void> {
  if (await isPlatformMemberAccount(accountId)) return;
  await recordAudit({ actorAccountId: accountId, actorUsername: accountId, action: "admin:platform", outcome: "denied" });
  throw new AccessDeniedError();
}

/** Throws AccessDeniedError (and audits the denial) unless `accountId` is platform_admin. */
export async function requirePlatformAdmin(accountId: string): Promise<void> {
  if (await isPlatformAdminAccount(accountId)) return;
  await recordAudit({ actorAccountId: accountId, actorUsername: accountId, action: "admin:platform_write", outcome: "denied" });
  throw new AccessDeniedError();
}

/**
 * A server's display name only -- for a breadcrumb or header label, not an
 * access decision. Deliberately narrower than `loadServer`: it never touches
 * `webui_key_encrypted`, so there's nothing here to decrypt or leak.
 */
export async function getServerName(serverId: string): Promise<string | null> {
  const { rows } = await getPool().query<{ name: string }>(
    "SELECT name FROM registered_servers WHERE id = $1",
    [serverId],
  );
  return rows[0]?.name ?? null;
}

/** Every registered server `accountId` can reach at all -- for the server picker. */
export async function listReachableServers(
  accountId: string,
): Promise<Array<{ id: string; name: string }>> {
  const { rows } = await getPool().query<{ id: string; name: string }>(
    `SELECT DISTINCT s.id, s.name FROM registered_servers s
     WHERE EXISTS (
       SELECT 1 FROM role_grants g
       WHERE g.dashboard_account_id = $1
         AND (g.role IN ('platform_admin', 'platform_read_only') OR g.server_id = s.id)
     )
     ORDER BY s.name`,
    [accountId],
  );
  return rows;
}

/**
 * Every org on `serverId` that `accountId` can reach -- for the org picker.
 * A Server/Platform-scope grant sees every org on the server (fetched live via
 * `GET /organizations`, the server-wide admin-style listing); an Org-scope
 * grant sees only its own org(s), read directly off the grant with no Cinc
 * Server call at all.
 */
export async function listReachableOrgs(accountId: string, serverId: string): Promise<Org[]> {
  const grants = await loadGrants(accountId);
  const hasBroadGrant = grants.some(
    (g) =>
      g.role === "platform_admin" ||
      g.role === "platform_read_only" ||
      (g.serverId === serverId && g.org === null),
  );
  if (hasBroadGrant) {
    const ctx = await requireServerAccess(accountId, serverId);
    return listAllOrgs(ctx);
  }
  const orgNames = new Set(
    grants.filter((g) => g.serverId === serverId && g.org !== null).map((g) => g.org as string),
  );
  return [...orgNames].sort().map((name) => ({ name }));
}

export type ReachableScope = { serverId: string; serverName: string; org: string };
export type UnavailableServer = { serverId: string; serverName: string; reason: string };

function explainUnavailable(e: unknown): string {
  return isCincError(e) ? `server error (${e.status})` : "unreachable";
}

/**
 * Every (server, org) pair `accountId` can read something in, across every
 * registered server -- the single composition point every aggregated
 * (cross-server/org) page uses. Degrades per server, same spirit as
 * fetchFleetCounts's degrade-not-throw pattern: one unreachable server's orgs
 * just can't be confirmed, which must not blank the whole aggregated view.
 */
export async function listReachableScopes(accountId: string): Promise<{
  scopes: ReachableScope[];
  unavailable: UnavailableServer[];
}> {
  const servers = await listReachableServers(accountId);
  const settled = await Promise.all(
    servers.map(async (s) => {
      try {
        return { server: s, orgs: await listReachableOrgs(accountId, s.id), error: null as string | null };
      } catch (e) {
        return { server: s, orgs: [] as Org[], error: explainUnavailable(e) };
      }
    }),
  );
  const scopes: ReachableScope[] = [];
  const unavailable: UnavailableServer[] = [];
  for (const r of settled) {
    if (r.error !== null) {
      unavailable.push({ serverId: r.server.id, serverName: r.server.name, reason: r.error });
    } else {
      for (const o of r.orgs) scopes.push({ serverId: r.server.id, serverName: r.server.name, org: o.name });
    }
  }
  return { scopes, unavailable };
}

export type ManyContextsResult = {
  contexts: Array<{ serverId: string; org: string; ctx: AuthorizedActionContext }>;
  /**
   * Pairs that didn't pass the scope/object check -- expected to be empty for
   * "read" when `pairs` came straight from `listReachableScopes`, but normal
   * for "write" (e.g. a viewer-only org offering nothing to a create-form
   * picker). Deliberately NOT audited: this is bulk authorization-aware
   * filtering ("what should I even show"), the same no-audit precedent as
   * `canAccessScope`/`listReachableOrgs` -- not an attempted action against a
   * server. Every actual Cinc HTTP call made with a returned context still
   * goes through `cincRequest`, which unconditionally audits it.
   */
  denied: Array<{ serverId: string; org: string }>;
};

/**
 * Shared minting loop for `requireObjectAccessMany`/`requireOrgAccessMany`:
 * loads grants and the account ONCE, loads only the DISTINCT `registered_servers`
 * rows the given pairs touch (several orgs often share one server), and
 * decrypts each server's webui key at most once rather than once per org.
 */
async function mintContextsMany(
  accountId: string,
  pairs: ReadonlyArray<{ serverId: string; org: string }>,
  allowed: (grants: RoleGrant[], serverId: string, org: string) => boolean,
): Promise<ManyContextsResult> {
  if (pairs.length === 0) return { contexts: [], denied: [] };

  const distinctIds = [...new Set(pairs.map((p) => p.serverId))];
  const [grants, account, servers] = await Promise.all([
    loadGrants(accountId),
    loadAccount(accountId),
    loadServers(distinctIds),
  ]);
  if (account === null) {
    return { contexts: [], denied: pairs.map(({ serverId, org }) => ({ serverId, org })) };
  }

  const serverById = new Map(servers.map((s) => [s.id, s]));
  const decryptedById = new Map<string, string>();
  const contexts: ManyContextsResult["contexts"] = [];
  const denied: ManyContextsResult["denied"] = [];

  for (const { serverId, org } of pairs) {
    const server = serverById.get(serverId);
    if (!server || !allowed(grants, serverId, org)) {
      denied.push({ serverId, org });
      continue;
    }
    if (!decryptedById.has(serverId)) {
      decryptedById.set(serverId, decrypt(server.webui_key_encrypted));
    }
    contexts.push({
      serverId,
      org,
      ctx: {
        serverId: server.id,
        serverUrl: server.base_url,
        webuiKey: decryptedById.get(serverId)!,
        caCert: server.ca_cert ?? undefined,
        sslNoVerify: server.tls_no_verify,
        impersonationUsername: server.impersonation_username,
        accountId: account.id,
        onBehalfOf: account.username,
        org,
        [brand]: true,
      } as AuthorizedActionContext,
    });
  }
  return { contexts, denied };
}

/** Batched sibling of `requireObjectAccess`, for aggregated list/create pages. */
export async function requireObjectAccessMany(
  accountId: string,
  pairs: ReadonlyArray<{ serverId: string; org: string }>,
  objectType: ObjectType,
  action: Action,
): Promise<ManyContextsResult> {
  return mintContextsMany(accountId, pairs, (grants, serverId, org) =>
    canAccessObject(grants, serverId, org, objectType, action),
  );
}

/** Batched sibling of `requireOrgAccess`, for the aggregated Members directory. */
export async function requireOrgAccessMany(
  accountId: string,
  pairs: ReadonlyArray<{ serverId: string; org: string }>,
): Promise<ManyContextsResult> {
  return mintContextsMany(accountId, pairs, (grants, serverId, org) => canAccessScope(grants, serverId, org));
}
