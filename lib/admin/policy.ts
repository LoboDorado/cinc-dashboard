// Pure authorization decision logic -- no DB, no I/O, fully unit-testable.
// lib/admin/access.ts loads a dashboard account's role grants from Postgres
// and calls into this module to decide allow/deny; keeping the decision
// itself free of I/O means the actual security-critical logic (not just its
// plumbing) has full test coverage without a live database.
//
// See the RBAC model in the plan: three scopes (platform/server/org), each
// with an admin tier (full access), and server/org additionally have an
// object-manager tier (write on a configured set of object types, read
// implied) and a viewer/read-only tier (read only). A broader-scope grant
// always satisfies a narrower check.

export const ROLES = [
  "platform_admin",
  "platform_read_only",
  "server_admin",
  "server_object_manager",
  "server_viewer",
  "org_admin",
  "org_object_manager",
  "org_viewer",
] as const;
export type Role = (typeof ROLES)[number];

export const OBJECT_TYPES = [
  "nodes",
  "cookbooks",
  "cookbook_artifacts",
  "roles",
  "environments",
  "data_bags",
  "clients",
  "policies",
  "policy_groups",
] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export type Action = "read" | "write";

/** One role grant, as loaded from `role_grants` (+ `role_grant_object_types`). */
export type RoleGrant = {
  role: Role;
  /** null for platform-scope grants. */
  serverId: string | null;
  /** null for platform/server-scope grants. */
  org: string | null;
  /** Populated only for `*_object_manager` grants. */
  objectTypes: readonly ObjectType[];
};

function grantAllowsObject(
  grant: RoleGrant,
  serverId: string,
  org: string,
  objectType: ObjectType,
  action: Action,
): boolean {
  switch (grant.role) {
    case "platform_admin":
      return true;
    case "platform_read_only":
      return action === "read";
    case "server_admin":
      return grant.serverId === serverId;
    case "server_viewer":
      return grant.serverId === serverId && action === "read";
    case "server_object_manager":
      return (
        grant.serverId === serverId &&
        (action === "read" || grant.objectTypes.includes(objectType))
      );
    case "org_admin":
      return grant.serverId === serverId && grant.org === org;
    case "org_viewer":
      return grant.serverId === serverId && grant.org === org && action === "read";
    case "org_object_manager":
      return (
        grant.serverId === serverId &&
        grant.org === org &&
        (action === "read" || grant.objectTypes.includes(objectType))
      );
  }
}

/** True if any of `grants` permits `action` on `objectType` in `org` on `serverId`. */
export function canAccessObject(
  grants: readonly RoleGrant[],
  serverId: string,
  org: string,
  objectType: ObjectType,
  action: Action,
): boolean {
  return grants.some((g) => grantAllowsObject(g, serverId, org, objectType, action));
}

function grantCoversScope(grant: RoleGrant, serverId: string, org?: string): boolean {
  if (grant.role === "platform_admin" || grant.role === "platform_read_only") return true;
  if (grant.serverId !== serverId) return false;
  if (grant.org === null) return true; // a server-scope role covers every org on that server
  return org !== undefined && grant.org === org;
}

/**
 * True if any of `grants` makes `serverId` (and `org`, if given) reachable at
 * all -- no object type or read/write distinction, just "can this account
 * see this server/org." Used for navigation (server/org pickers), never as
 * the gate for an actual object read/write.
 */
export function canAccessScope(
  grants: readonly RoleGrant[],
  serverId: string,
  org?: string,
): boolean {
  return grants.some((g) => grantCoversScope(g, serverId, org));
}

/** True if any of `grants` is an admin tier (platform/server/org) at a scope covering `serverId`/`org`. */
export function canViewAssignments(
  grants: readonly RoleGrant[],
  serverId?: string,
  org?: string,
): boolean {
  return grants.some((g) => {
    if (g.role === "platform_admin") return true;
    if (serverId === undefined) return false;
    if (g.role === "server_admin") return g.serverId === serverId;
    if (g.role === "org_admin") return g.serverId === serverId && g.org === (org ?? null);
    return false;
  });
}

/**
 * True if any of `grants` is an admin tier (platform/server/org) covering
 * `org` on `serverId`. Members and Groups management is deliberately NOT
 * part of the configurable Object Manager set (groups are commonly used to
 * build the underlying Cinc Server's own ACLs) -- it's gated by this
 * admin-tier check instead of `canAccessObject`.
 */
export function isScopeAdmin(grants: readonly RoleGrant[], serverId: string, org: string): boolean {
  return grants.some((g) => {
    if (g.role === "platform_admin") return true;
    if (g.role === "server_admin") return g.serverId === serverId;
    if (g.role === "org_admin") return g.serverId === serverId && g.org === org;
    return false;
  });
}

/** True if any of `grants` is `platform_admin` -- gates the platform admin area's write actions. */
export function isPlatformAdmin(grants: readonly RoleGrant[]): boolean {
  return grants.some((g) => g.role === "platform_admin");
}

/** True if any of `grants` is `platform_admin` or `platform_read_only` -- gates the platform admin area's read access. */
export function isPlatformMember(grants: readonly RoleGrant[]): boolean {
  return grants.some((g) => g.role === "platform_admin" || g.role === "platform_read_only");
}

/** The scope a new role grant targets -- fixes which roles are even eligible. */
export type GrantScope =
  | { kind: "platform" }
  | { kind: "server"; serverId: string }
  | { kind: "org"; serverId: string; org: string };

/**
 * Which roles `granterGrants` is allowed to grant at `scope`, per the
 * delegation table: Platform Admin grants anything, anywhere; a Server Admin
 * grants Server Object Manager/Viewer and any org-level role on their own
 * server; an Org Admin grants Org Object Manager/Viewer within their own org.
 * Delegation is always capped one tier below the granter's own level --
 * creating a peer at the granter's own tier always requires a Platform
 * Admin. Returns `[]` (nothing grantable) rather than throwing; callers
 * decide how to report that.
 */
export function grantableRoles(granterGrants: readonly RoleGrant[], scope: GrantScope): Role[] {
  if (isPlatformAdmin(granterGrants)) {
    if (scope.kind === "platform") return ["platform_admin", "platform_read_only"];
    if (scope.kind === "server") return ["server_admin", "server_object_manager", "server_viewer"];
    return ["org_admin", "org_object_manager", "org_viewer"];
  }
  if (scope.kind === "platform") return []; // only a Platform Admin grants platform-scope roles

  const isServerAdminHere = granterGrants.some(
    (g) => g.role === "server_admin" && g.serverId === scope.serverId,
  );
  if (scope.kind === "server") {
    return isServerAdminHere ? ["server_object_manager", "server_viewer"] : [];
  }

  // scope.kind === "org"
  if (isServerAdminHere) return ["org_admin", "org_object_manager", "org_viewer"];
  const isOrgAdminHere = granterGrants.some(
    (g) => g.role === "org_admin" && g.serverId === scope.serverId && g.org === scope.org,
  );
  return isOrgAdminHere ? ["org_object_manager", "org_viewer"] : [];
}
