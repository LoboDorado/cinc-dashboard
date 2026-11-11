// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/guard", () => ({ currentAccountId: async () => "acct-1" }));

const { requirePlatformAdmin, createRegisteredServer, updateRegisteredServer, deleteRegisteredServer } =
  vi.hoisted(() => ({
    requirePlatformAdmin: vi.fn(),
    createRegisteredServer: vi.fn(),
    updateRegisteredServer: vi.fn(),
    deleteRegisteredServer: vi.fn(),
  }));
vi.mock("@/lib/admin/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/access")>()),
  requirePlatformAdmin,
}));
vi.mock("@/lib/admin/servers", () => ({
  createRegisteredServer,
  updateRegisteredServer,
  deleteRegisteredServer,
}));

import { createServerAction, updateServerAction, deleteServerAction } from "./actions";

const input = {
  name: "Primary",
  baseUrl: "https://chef.example.com",
  webuiKey: "PEM",
  impersonationUsername: "pivotal",
  tlsNoVerify: false,
};

beforeEach(() => {
  requirePlatformAdmin.mockReset().mockResolvedValue(undefined);
  createRegisteredServer.mockReset();
  updateRegisteredServer.mockReset();
  deleteRegisteredServer.mockReset();
});

test("createServerAction checks platform-admin access before creating", async () => {
  createRegisteredServer.mockResolvedValueOnce("s1");
  await expect(createServerAction(input)).resolves.toEqual({ ok: true });
  expect(requirePlatformAdmin).toHaveBeenCalledWith("acct-1");
  expect(createRegisteredServer).toHaveBeenCalledWith(input);
});

test("createServerAction is denied for a non-platform-admin account", async () => {
  const { AccessDeniedError } = await import("@/lib/admin/access");
  requirePlatformAdmin.mockRejectedValueOnce(new AccessDeniedError());
  await expect(createServerAction(input)).resolves.toEqual({ error: "forbidden" });
  expect(createRegisteredServer).not.toHaveBeenCalled();
});

test("updateServerAction passes the id and input through", async () => {
  await updateServerAction("s1", input);
  expect(updateRegisteredServer).toHaveBeenCalledWith("s1", input);
});

test("deleteServerAction deletes by id", async () => {
  await expect(deleteServerAction("s1")).resolves.toEqual({ ok: true });
  expect(deleteRegisteredServer).toHaveBeenCalledWith("s1");
});
