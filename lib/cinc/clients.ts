import "server-only";
import type { AuthorizedActionContext } from "../admin/access";
import { cincRequest } from "./client";
import { cincPath } from "./path";

export type CreatedClient = { name: string; privateKey: string };

/**
 * Create an API client. `create_key: true` asks the server to generate a key
 * pair and return the **private key once** (it is never retrievable again — GET
 * only exposes the public key), so the caller must surface it to the user.
 */
export async function createClient(
  ctx: AuthorizedActionContext,
  name: string,
): Promise<CreatedClient> {
  const res = await cincRequest<{
    chef_key?: { private_key?: string };
    private_key?: string;
  }>(ctx, {
    method: "POST",
    path: cincPath`/clients`,
    body: { name, create_key: true },
  });
  const privateKey = res.chef_key?.private_key ?? res.private_key ?? "";
  return { name, privateKey };
}

/** Delete a client (`DELETE /clients/NAME`). */
export async function deleteClient(ctx: AuthorizedActionContext, name: string): Promise<void> {
  await cincRequest(ctx, { method: "DELETE", path: cincPath`/clients/${name}` });
}
