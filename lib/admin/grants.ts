// Role grant management: the single place new role_grants rows are created
// or removed, so the delegation cap (lib/admin/policy.ts's grantableRoles)
// is enforced in exactly one spot.
import "server-only";
import { getPool } from "../db/client";
import { recordAudit } from "../db/audit";
import { getAccountById } from "../dashboard/accounts";
import { loadGrants } from "./access";
import { grantableRoles, type GrantScope, type ObjectType, type Role } from "./policy";

async function usernameOf(accountId: string): Promise<string> {
  const account = await getAccountById(accountId);
  return account?.username ?? accountId;
}

export class DelegationDeniedError extends Error {
  constructor() {
    super("you are not allowed to grant that role at that scope");
    this.name = "DelegationDeniedError";
  }
}

export type RoleGrantSummary = {
  id: string;
  accountId: string;
  accountUsername: string;
  role: Role;
  serverId: string | null;
  org: string | null;
  objectTypes: ObjectType[];
  grantedBy: string | null;
  grantedAt: string;
};

function scopeColumns(scope: GrantScope): { serverId: string | null; org: string | null } {
  if (scope.kind === "platform") return { serverId: null, org: null };
  if (scope.kind === "server") return { serverId: scope.serverId, org: null };
  return { serverId: scope.serverId, org: scope.org };
}

/**
 * Grant `role` (optionally scoped to `objectTypes`, for `*_object_manager`
 * roles) to `targetAccountId` at `scope`, on behalf of `granterAccountId`.
 * Denies (and audits the denial) unless `grantableRoles` for the granter's
 * own grants includes `role` at `scope` -- this is the delegation cap, kept
 * separate from `lib/admin/access.ts`'s object-read/write checks since
 * granting a role is itself a distinct, rarer, higher-stakes action.
 */
export async function createRoleGrant(
  granterAccountId: string,
  targetAccountId: string,
  role: Role,
  scope: GrantScope,
  objectTypes: ObjectType[] = [],
): Promise<void> {
  const [granterGrants, actorUsername] = await Promise.all([
    loadGrants(granterAccountId),
    usernameOf(granterAccountId),
  ]);
  const allowed = grantableRoles(granterGrants, scope).includes(role);
  if (!allowed) {
    await recordAudit({
      actorAccountId: granterAccountId,
      actorUsername,
      serverId: scope.kind === "platform" ? undefined : scope.serverId,
      org: scope.kind === "org" ? scope.org : undefined,
      action: "role_grant.create",
      outcome: "denied",
    });
    throw new DelegationDeniedError();
  }

  const { serverId, org } = scopeColumns(scope);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO role_grants (dashboard_account_id, role, server_id, org, granted_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [targetAccountId, role, serverId, org, granterAccountId],
    );
    const grantId = rows[0].id;
    for (const objectType of objectTypes) {
      await client.query(
        "INSERT INTO role_grant_object_types (role_grant_id, object_type) VALUES ($1, $2)",
        [grantId, objectType],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  await recordAudit({
    actorAccountId: granterAccountId,
    actorUsername,
    serverId: serverId ?? undefined,
    org: org ?? undefined,
    action: "role_grant.create",
    outcome: "success",
    resourcePath: `${targetAccountId}:${role}`,
  });
}

/**
 * Revoke a role grant. A granter can revoke anything they could grant at
 * that same scope -- the same `grantableRoles` check, run against the
 * grant's own recorded scope/role rather than a caller-supplied one.
 */
export async function revokeRoleGrant(granterAccountId: string, grantId: string): Promise<void> {
  const { rows } = await getPool().query<{
    role: Role;
    server_id: string | null;
    org: string | null;
  }>("SELECT role, server_id, org FROM role_grants WHERE id = $1", [grantId]);
  const grant = rows[0];
  if (!grant) return; // already gone; revoking a nonexistent grant is a no-op

  const scope: GrantScope =
    grant.server_id === null
      ? { kind: "platform" }
      : grant.org === null
        ? { kind: "server", serverId: grant.server_id }
        : { kind: "org", serverId: grant.server_id, org: grant.org };

  const [granterGrants, actorUsername] = await Promise.all([
    loadGrants(granterAccountId),
    usernameOf(granterAccountId),
  ]);
  const allowed = grantableRoles(granterGrants, scope).includes(grant.role);
  if (!allowed) {
    await recordAudit({
      actorAccountId: granterAccountId,
      actorUsername,
      serverId: grant.server_id ?? undefined,
      org: grant.org ?? undefined,
      action: "role_grant.revoke",
      outcome: "denied",
    });
    throw new DelegationDeniedError();
  }

  await getPool().query("DELETE FROM role_grants WHERE id = $1", [grantId]);
  await recordAudit({
    actorAccountId: granterAccountId,
    actorUsername,
    serverId: grant.server_id ?? undefined,
    org: grant.org ?? undefined,
    action: "role_grant.revoke",
    outcome: "success",
    resourcePath: grantId,
  });
}

type GrantListRow = {
  id: string;
  dashboard_account_id: string;
  username: string;
  role: Role;
  server_id: string | null;
  org: string | null;
  object_types: string[] | null;
  granted_by: string | null;
  granted_at: string;
};

function mapGrantRow(r: GrantListRow): RoleGrantSummary {
  return {
    id: r.id,
    accountId: r.dashboard_account_id,
    accountUsername: r.username,
    role: r.role,
    serverId: r.server_id,
    org: r.org,
    objectTypes: (r.object_types ?? []) as ObjectType[],
    grantedBy: r.granted_by,
    grantedAt: r.granted_at,
  };
}

/** Every grant at `scope` -- platform scope lists only platform-tier grants; server scope lists that server's own grants plus every org grant under it; org scope lists just that org's. */
export async function listRoleGrants(scope: GrantScope): Promise<RoleGrantSummary[]> {
  const pool = getPool();
  let where: string;
  let params: unknown[];
  if (scope.kind === "platform") {
    where = "g.server_id IS NULL";
    params = [];
  } else if (scope.kind === "server") {
    where = "g.server_id = $1";
    params = [scope.serverId];
  } else {
    where = "g.server_id = $1 AND g.org = $2";
    params = [scope.serverId, scope.org];
  }

  const { rows } = await pool.query<GrantListRow>(
    `SELECT g.id, g.dashboard_account_id, a.username, g.role, g.server_id, g.org,
            array_remove(array_agg(ot.object_type), NULL) AS object_types,
            g.granted_by, g.granted_at
     FROM role_grants g
     JOIN dashboard_accounts a ON a.id = g.dashboard_account_id
     LEFT JOIN role_grant_object_types ot ON ot.role_grant_id = g.id
     WHERE ${where}
     GROUP BY g.id, a.username
     ORDER BY a.username`,
    params,
  );

  return rows.map(mapGrantRow);
}

/** Every grant held by one account, newest first -- for its admin detail page. */
export async function listGrantsForAccount(accountId: string): Promise<RoleGrantSummary[]> {
  const { rows } = await getPool().query<GrantListRow>(
    `SELECT g.id, g.dashboard_account_id, a.username, g.role, g.server_id, g.org,
            array_remove(array_agg(ot.object_type), NULL) AS object_types,
            g.granted_by, g.granted_at
     FROM role_grants g
     JOIN dashboard_accounts a ON a.id = g.dashboard_account_id
     LEFT JOIN role_grant_object_types ot ON ot.role_grant_id = g.id
     WHERE g.dashboard_account_id = $1
     GROUP BY g.id, a.username
     ORDER BY g.granted_at DESC`,
    [accountId],
  );

  return rows.map(mapGrantRow);
}
