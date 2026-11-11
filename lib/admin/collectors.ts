// Platform-Admin-only CRUD for registered Cinc Collectors, plus their
// many-to-many linkage to registered servers. Storage/registration only --
// no requests are made to a registered Collector yet (see CLAUDE.md).
import "server-only";
import { getPool } from "../db/client";
import { encrypt } from "../db/secretbox";
import { recordAudit } from "../db/audit";

export type RegisteredCollectorSummary = {
  id: string;
  name: string;
  baseUrl: string;
  hasCaCert: boolean;
  tlsNoVerify: boolean;
  linkedServerIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type RegisteredCollectorInput = {
  name: string;
  baseUrl: string;
  caCert?: string;
  bearerToken: string;
  tlsNoVerify: boolean;
  /** The full desired set of linked server ids; diffed against the current set. */
  serverIds: string[];
};

type CollectorRow = {
  id: string;
  name: string;
  base_url: string;
  ca_cert: string | null;
  tls_no_verify: boolean;
  server_ids: string[] | null;
  created_at: string;
  updated_at: string;
};

function toSummary(r: CollectorRow): RegisteredCollectorSummary {
  return {
    id: r.id,
    name: r.name,
    baseUrl: r.base_url,
    hasCaCert: r.ca_cert !== null,
    tlsNoVerify: r.tls_no_verify,
    linkedServerIds: r.server_ids ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT_WITH_LINKS = `
  SELECT c.id, c.name, c.base_url, c.ca_cert, c.tls_no_verify, c.created_at, c.updated_at,
         array_remove(array_agg(cs.server_id), NULL) AS server_ids
  FROM registered_collectors c
  LEFT JOIN registered_collector_servers cs ON cs.collector_id = c.id
`;

export async function listRegisteredCollectors(): Promise<RegisteredCollectorSummary[]> {
  const { rows } = await getPool().query<CollectorRow>(
    `${SELECT_WITH_LINKS} GROUP BY c.id ORDER BY c.name`,
  );
  return rows.map(toSummary);
}

export async function getRegisteredCollector(id: string): Promise<RegisteredCollectorSummary | null> {
  const { rows } = await getPool().query<CollectorRow>(
    `${SELECT_WITH_LINKS} WHERE c.id = $1 GROUP BY c.id`,
    [id],
  );
  return rows[0] ? toSummary(rows[0]) : null;
}

async function setLinkedServers(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  collectorId: string,
  serverIds: string[],
  actorUsername: string,
): Promise<void> {
  const { rows: existing } = (await client.query(
    "SELECT server_id FROM registered_collector_servers WHERE collector_id = $1",
    [collectorId],
  )) as { rows: { server_id: string }[] };
  const before = new Set(existing.map((r) => r.server_id));
  const after = new Set(serverIds);

  for (const serverId of after) {
    if (before.has(serverId)) continue;
    await client.query(
      "INSERT INTO registered_collector_servers (collector_id, server_id) VALUES ($1, $2)",
      [collectorId, serverId],
    );
    await recordAudit({
      actorUsername,
      serverId,
      action: "collector_server_link.create",
      outcome: "success",
      resourcePath: collectorId,
    });
  }
  for (const serverId of before) {
    if (after.has(serverId)) continue;
    await client.query(
      "DELETE FROM registered_collector_servers WHERE collector_id = $1 AND server_id = $2",
      [collectorId, serverId],
    );
    await recordAudit({
      actorUsername,
      serverId,
      action: "collector_server_link.revoke",
      outcome: "success",
      resourcePath: collectorId,
    });
  }
}

export async function createRegisteredCollector(
  input: RegisteredCollectorInput,
  actorUsername: string,
): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO registered_collectors (name, base_url, ca_cert, bearer_token_encrypted, tls_no_verify)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.name, input.baseUrl, input.caCert ?? null, encrypt(input.bearerToken), input.tlsNoVerify],
  );
  const id = rows[0].id;
  await setLinkedServers(pool, id, input.serverIds, actorUsername);
  return id;
}

/**
 * `bearerToken` and `caCert` are each only rewritten when a caller provides a
 * new (non-empty) value -- an edit form can't show either back for
 * comparison, so "left blank" has to mean "leave unchanged," not "clear it."
 */
export async function updateRegisteredCollector(
  id: string,
  input: Omit<RegisteredCollectorInput, "bearerToken" | "caCert"> & { bearerToken?: string; caCert?: string },
  actorUsername: string,
): Promise<void> {
  const pool = getPool();
  const sets = ["name = $1", "base_url = $2", "tls_no_verify = $3"];
  const params: unknown[] = [input.name, input.baseUrl, input.tlsNoVerify];

  if (input.caCert) {
    params.push(input.caCert);
    sets.push(`ca_cert = $${params.length}`);
  }
  if (input.bearerToken) {
    params.push(encrypt(input.bearerToken));
    sets.push(`bearer_token_encrypted = $${params.length}`);
  }

  params.push(id);
  await pool.query(
    `UPDATE registered_collectors SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}`,
    params,
  );
  await setLinkedServers(pool, id, input.serverIds, actorUsername);
}

/** Cascades to registered_collector_servers (ON DELETE CASCADE per migration). */
export async function deleteRegisteredCollector(id: string): Promise<void> {
  await getPool().query("DELETE FROM registered_collectors WHERE id = $1", [id]);
}
