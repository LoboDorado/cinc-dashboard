// Read-only audit log listing for the three admin-tier audit viewers
// (platform-wide, one server, one org). Every row already carries
// denormalized actor_username/server_name snapshots (lib/db/audit.ts), so
// this never needs to join against accounts/servers that may since have
// been deleted.
import "server-only";
import { getPool } from "../db/client";

export type AuditScope =
  | { kind: "platform" }
  | { kind: "server"; serverId: string }
  | { kind: "org"; serverId: string; org: string };

export type AuditFilters = {
  account?: string;
  from?: string;
  to?: string;
};

export type AuditEntry = {
  id: string;
  at: string;
  actorUsername: string;
  serverName: string | null;
  org: string | null;
  action: string;
  resourcePath: string | null;
  outcome: string;
  statusCode: number | null;
};

const PAGE_SIZE = 50;

type AuditRow = {
  id: string;
  at: string;
  actor_username: string;
  server_name: string | null;
  org: string | null;
  action: string;
  resource_path: string | null;
  outcome: string;
  status_code: number | null;
};

function toEntry(r: AuditRow): AuditEntry {
  return {
    id: r.id,
    at: r.at,
    actorUsername: r.actor_username,
    serverName: r.server_name,
    org: r.org,
    action: r.action,
    resourcePath: r.resource_path,
    outcome: r.outcome,
    statusCode: r.status_code,
  };
}

/**
 * Entries visible at `scope`, newest first, filtered and cursor-paginated.
 * Platform scope sees everything; server scope sees that server's entries
 * (across every org); org scope sees just that org's. `cursor` is the `id`
 * of the last entry already shown ("Load more", not numbered pages).
 */
export async function listAuditEntries(
  scope: AuditScope,
  filters: AuditFilters = {},
  cursor?: string,
): Promise<{ entries: AuditEntry[]; nextCursor: string | null }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  function addCondition(sql: string, value: unknown) {
    params.push(value);
    conditions.push(sql.replace("?", `$${params.length}`));
  }

  if (scope.kind === "server") {
    addCondition("server_id = ?", scope.serverId);
  } else if (scope.kind === "org") {
    addCondition("server_id = ?", scope.serverId);
    addCondition("org = ?", scope.org);
  }
  if (filters.account) addCondition("actor_username = ?", filters.account);
  if (filters.from) addCondition("at >= ?", filters.from);
  if (filters.to) addCondition("at <= ?", filters.to);
  if (cursor) addCondition("id < ?", cursor);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(PAGE_SIZE + 1); // fetch one extra row to know if there's a next page

  const { rows } = await getPool().query<AuditRow>(
    `SELECT id, at, actor_username, server_name, org, action, resource_path, outcome, status_code
     FROM audit_log
     ${where}
     ORDER BY id DESC
     LIMIT $${params.length}`,
    params,
  );

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  return {
    entries: page.map(toEntry),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}
