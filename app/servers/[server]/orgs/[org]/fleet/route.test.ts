// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class Unauthorized extends Error {}
  class AccessDeniedError extends Error {}
  return {
    Unauthorized,
    AccessDeniedError,
    requireAccountId: vi.fn(),
    requireObjectAccess: vi.fn(),
    loadFleetSnapshot: vi.fn(),
  };
});
vi.mock("@/lib/session", () => ({
  requireAccountId: mocks.requireAccountId,
  Unauthorized: mocks.Unauthorized,
}));
vi.mock("@/lib/admin/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/access")>()),
  requireObjectAccess: mocks.requireObjectAccess,
  AccessDeniedError: mocks.AccessDeniedError,
}));
vi.mock("@/lib/cinc/fleet-snapshot", () => ({
  loadFleetSnapshot: mocks.loadFleetSnapshot,
}));
vi.mock("@/lib/cinc/client", () => ({ nowMs: () => 1_000 }));

import { GET } from "./route";

const call = (server = "s1", org = "acme") =>
  GET(new Request(`https://dashboard.test/servers/${server}/orgs/${org}/fleet`), {
    params: Promise.resolve({ server, org }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAccountId.mockResolvedValue("acct-1");
  mocks.requireObjectAccess.mockResolvedValue("ctx");
});

test("returns the snapshot as uncached JSON for the session account", async () => {
  const snapshot = { stats: { total: 0 }, nodes: [], generatedAt: 1_000 };
  mocks.loadFleetSnapshot.mockResolvedValue({ data: snapshot });

  const res = await call();

  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  await expect(res.json()).resolves.toEqual(snapshot);
  expect(mocks.requireObjectAccess).toHaveBeenCalledWith("acct-1", "s1", "acme", "nodes", "read");
  expect(mocks.loadFleetSnapshot).toHaveBeenCalledWith("ctx", 1_000);
});

test("no session gets a JSON 401, not a redirect", async () => {
  mocks.requireAccountId.mockRejectedValue(new mocks.Unauthorized());

  const res = await call();

  expect(res.status).toBe(401);
  expect(res.headers.get("location")).toBeNull();
  await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  expect(mocks.loadFleetSnapshot).not.toHaveBeenCalled();
});

test("a role-grant denial is handed to the client with status 200", async () => {
  mocks.requireObjectAccess.mockRejectedValue(new mocks.AccessDeniedError());

  const res = await call();

  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ error: "forbidden" });
});

test("an ACL error is handed to the client with status 200", async () => {
  mocks.loadFleetSnapshot.mockResolvedValue({ error: "forbidden" });

  const res = await call();

  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ error: "forbidden" });
});

test("an unexpected session failure is not swallowed", async () => {
  mocks.requireAccountId.mockRejectedValue(new Error("iron-session exploded"));
  await expect(call()).rejects.toThrow("iron-session exploded");
});
