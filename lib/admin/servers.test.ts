// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

const { query, config } = vi.hoisted(() => ({
  query: vi.fn(),
  config: { dashboardEncryptionKey: "k".repeat(32) },
}));
vi.mock("../db/client", () => ({ getPool: () => ({ query }) }));
vi.mock("../config", () => ({ getConfig: () => config }));

import {
  createRegisteredServer,
  updateRegisteredServer,
  deleteRegisteredServer,
  getRegisteredServer,
  listRegisteredServers,
} from "./servers";

beforeEach(() => query.mockReset());

const row = {
  id: "s1",
  name: "Primary",
  base_url: "https://chef.example.com",
  ca_cert: null,
  impersonation_username: "pivotal",
  tls_no_verify: false,
  created_at: "now",
  updated_at: "now",
};

test("listRegisteredServers never exposes the encrypted webui key column", async () => {
  query.mockResolvedValueOnce({ rows: [row] });
  const result = await listRegisteredServers();
  expect(result).toEqual([
    {
      id: "s1",
      name: "Primary",
      baseUrl: "https://chef.example.com",
      hasCaCert: false,
      impersonationUsername: "pivotal",
      tlsNoVerify: false,
      createdAt: "now",
      updatedAt: "now",
    },
  ]);
  expect(query.mock.calls[0][0]).not.toMatch(/webui_key/);
});

test("getRegisteredServer returns null for an unknown id", async () => {
  query.mockResolvedValueOnce({ rows: [] });
  expect(await getRegisteredServer("nope")).toBeNull();
});

test("createRegisteredServer encrypts the webui key before storing it", async () => {
  query.mockResolvedValueOnce({ rows: [{ id: "new-id" }] });
  const id = await createRegisteredServer({
    name: "Primary",
    baseUrl: "https://chef.example.com",
    webuiKey: "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----",
    impersonationUsername: "pivotal",
    tlsNoVerify: false,
  });
  expect(id).toBe("new-id");
  const params = query.mock.calls[0][1] as unknown[];
  const storedKey = params[3];
  expect(Buffer.isBuffer(storedKey)).toBe(true);
  expect((storedKey as Buffer).toString("utf8")).not.toContain("BEGIN RSA PRIVATE KEY");
});

test("updateRegisteredServer without a new webui key does not touch that column", async () => {
  query.mockResolvedValueOnce({ rows: [] });
  await updateRegisteredServer("s1", {
    name: "Primary",
    baseUrl: "https://chef.example.com",
    impersonationUsername: "pivotal",
    tlsNoVerify: false,
  });
  expect(query.mock.calls[0][0]).not.toMatch(/webui_key_encrypted = /);
});

test("updateRegisteredServer without a new CA cert does not touch that column either", async () => {
  query.mockResolvedValueOnce({ rows: [] });
  await updateRegisteredServer("s1", {
    name: "Primary",
    baseUrl: "https://chef.example.com",
    impersonationUsername: "pivotal",
    tlsNoVerify: false,
  });
  expect(query.mock.calls[0][0]).not.toMatch(/ca_cert = /);
});

test("updateRegisteredServer with a new webui key re-encrypts it", async () => {
  query.mockResolvedValueOnce({ rows: [] });
  await updateRegisteredServer("s1", {
    name: "Primary",
    baseUrl: "https://chef.example.com",
    impersonationUsername: "pivotal",
    tlsNoVerify: false,
    webuiKey: "NEWKEY",
  });
  expect(query.mock.calls[0][0]).toMatch(/webui_key_encrypted = /);
});

test("deleteRegisteredServer deletes by id", async () => {
  query.mockResolvedValueOnce({ rows: [] });
  await deleteRegisteredServer("s1");
  expect(query).toHaveBeenCalledWith("DELETE FROM registered_servers WHERE id = $1", ["s1"]);
});
