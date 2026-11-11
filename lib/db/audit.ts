// Writes to audit_log. Called from the authorization chokepoint
// (lib/admin/access.ts) on both denial and (after the Cinc Server responds)
// success/error, plus from grant/collector-linkage/break-glass actions.
// Deliberately awaited by every caller, never fire-and-forget: a failed
// audit write fails the request it would have recorded (fail closed).
import "server-only";
import { getPool } from "./client";

export type AuditEntry = {
  actorAccountId?: string;
  actorUsername: string;
  serverId?: string;
  serverName?: string;
  org?: string;
  action: string;
  resourcePath?: string;
  outcome: "success" | "error" | "denied";
  statusCode?: number;
  requestId?: string;
};

export async function recordAudit(entry: AuditEntry): Promise<void> {
  await getPool().query(
    `INSERT INTO audit_log
       (actor_account_id, actor_username, server_id, server_name, org, action,
        resource_path, outcome, status_code, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.actorAccountId ?? null,
      entry.actorUsername,
      entry.serverId ?? null,
      entry.serverName ?? null,
      entry.org ?? null,
      entry.action,
      entry.resourcePath ?? null,
      entry.outcome,
      entry.statusCode ?? null,
      entry.requestId ?? null,
    ],
  );
}
