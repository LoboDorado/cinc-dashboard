// Shared route-path builders. Pure, no I/O -- importable from server and
// client components alike. Centralizes what was previously ~15+ ad hoc
// `/servers/${server}/orgs/${org}/...` template literals scattered across
// nav, breadcrumbs, the command palette, and every object kind's own
// page.tsx/actions.ts.

export function orgPath(serverId: string, org: string): string {
  return `/servers/${encodeURIComponent(serverId)}/orgs/${encodeURIComponent(org)}`;
}

/** A concrete object's detail/edit route: /servers/<s>/orgs/<o>/<kind>/<name>. */
export function objectPath(serverId: string, org: string, kind: string, name: string): string {
  return `${orgPath(serverId, org)}/${kind}/${encodeURIComponent(name)}`;
}

/** The aggregated, scope-free list route for a kind, e.g. /roles. */
export function listPath(kind: string): string {
  return `/${kind}`;
}

/** The aggregated, scope-free create route for a kind that supports one, e.g. /roles/new. */
export function newPath(kind: string): string {
  return `/${kind}/new`;
}

/** A node's Compliance tab's lazy-fetch route: /servers/<s>/orgs/<o>/nodes/<name>/compliance. */
export function nodeCompliancePath(serverId: string, org: string, name: string): string {
  return `${objectPath(serverId, org, "nodes", name)}/compliance`;
}

/** One compliance report's detail route, nested under its node. */
export function complianceReportPath(
  serverId: string,
  org: string,
  name: string,
  reportId: string,
): string {
  return `${nodeCompliancePath(serverId, org, name)}/${encodeURIComponent(reportId)}`;
}

export function orgAdminPath(serverId: string, org: string, section: "roles" | "audit"): string {
  return `${orgPath(serverId, org)}/admin/${section}`;
}

export function serverAdminPath(serverId: string, section: "roles" | "audit"): string {
  return `/servers/${encodeURIComponent(serverId)}/admin/${section}`;
}
