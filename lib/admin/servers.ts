// Platform-Admin-only CRUD for registered Cinc Servers. The webui key is
// write-only: accepted on create/rotate, encrypted at rest (lib/db/secretbox),
// and never read back out for display.
import "server-only";
import { getPool } from "../db/client";
import { encrypt } from "../db/secretbox";

export type RegisteredServerSummary = {
  id: string;
  name: string;
  baseUrl: string;
  hasCaCert: boolean;
  impersonationUsername: string;
  tlsNoVerify: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RegisteredServerInput = {
  name: string;
  baseUrl: string;
  caCert?: string;
  webuiKey: string;
  impersonationUsername: string;
  tlsNoVerify: boolean;
};

type ServerRow = {
  id: string;
  name: string;
  base_url: string;
  ca_cert: string | null;
  impersonation_username: string;
  tls_no_verify: boolean;
  created_at: string;
  updated_at: string;
};

function toSummary(r: ServerRow): RegisteredServerSummary {
  return {
    id: r.id,
    name: r.name,
    baseUrl: r.base_url,
    hasCaCert: r.ca_cert !== null,
    impersonationUsername: r.impersonation_username,
    tlsNoVerify: r.tls_no_verify,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SUMMARY_COLUMNS =
  "id, name, base_url, ca_cert, impersonation_username, tls_no_verify, created_at, updated_at";

export async function listRegisteredServers(): Promise<RegisteredServerSummary[]> {
  const { rows } = await getPool().query<ServerRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM registered_servers ORDER BY name`,
  );
  return rows.map(toSummary);
}

export async function getRegisteredServer(id: string): Promise<RegisteredServerSummary | null> {
  const { rows } = await getPool().query<ServerRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM registered_servers WHERE id = $1`,
    [id],
  );
  return rows[0] ? toSummary(rows[0]) : null;
}

export async function createRegisteredServer(input: RegisteredServerInput): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO registered_servers
       (name, base_url, ca_cert, webui_key_encrypted, impersonation_username, tls_no_verify)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.name,
      input.baseUrl,
      input.caCert ?? null,
      encrypt(input.webuiKey),
      input.impersonationUsername,
      input.tlsNoVerify,
    ],
  );
  return rows[0].id;
}

/**
 * `webuiKey` and `caCert` are each only rewritten when a caller provides a
 * new (non-empty) value -- an edit form can't show either back for
 * comparison, so "left blank" has to mean "leave unchanged," not "clear it."
 */
export async function updateRegisteredServer(
  id: string,
  input: Omit<RegisteredServerInput, "webuiKey" | "caCert"> & { webuiKey?: string; caCert?: string },
): Promise<void> {
  const sets = ["name = $1", "base_url = $2", "impersonation_username = $3", "tls_no_verify = $4"];
  const params: unknown[] = [input.name, input.baseUrl, input.impersonationUsername, input.tlsNoVerify];

  if (input.caCert) {
    params.push(input.caCert);
    sets.push(`ca_cert = $${params.length}`);
  }
  if (input.webuiKey) {
    params.push(encrypt(input.webuiKey));
    sets.push(`webui_key_encrypted = $${params.length}`);
  }

  params.push(id);
  await getPool().query(
    `UPDATE registered_servers SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}`,
    params,
  );
}

/** Cascades to role_grants, registered_collector_servers, and audit_log's server_id (ON DELETE SET NULL/CASCADE per migration). */
export async function deleteRegisteredServer(id: string): Promise<void> {
  await getPool().query("DELETE FROM registered_servers WHERE id = $1", [id]);
}
