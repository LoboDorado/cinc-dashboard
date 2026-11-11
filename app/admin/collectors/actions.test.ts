// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/guard", () => ({
  currentAccount: async () => ({ id: "acct-1", username: "alice", displayName: "Alice", authSource: "local" }),
}));

const { requirePlatformAdmin, createRegisteredCollector, updateRegisteredCollector, deleteRegisteredCollector } =
  vi.hoisted(() => ({
    requirePlatformAdmin: vi.fn(),
    createRegisteredCollector: vi.fn(),
    updateRegisteredCollector: vi.fn(),
    deleteRegisteredCollector: vi.fn(),
  }));
vi.mock("@/lib/admin/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/access")>()),
  requirePlatformAdmin,
}));
vi.mock("@/lib/admin/collectors", () => ({
  createRegisteredCollector,
  updateRegisteredCollector,
  deleteRegisteredCollector,
}));

import { createCollectorAction, updateCollectorAction, deleteCollectorAction } from "./actions";

const input = {
  name: "Collector A",
  baseUrl: "https://collector.example.com",
  bearerToken: "secret",
  tlsNoVerify: false,
  serverIds: ["s1"],
};

beforeEach(() => {
  requirePlatformAdmin.mockReset().mockResolvedValue(undefined);
  createRegisteredCollector.mockReset();
  updateRegisteredCollector.mockReset();
  deleteRegisteredCollector.mockReset();
});

test("createCollectorAction checks platform-admin access and attributes the actor by username", async () => {
  createRegisteredCollector.mockResolvedValueOnce("c1");
  await expect(createCollectorAction(input)).resolves.toEqual({ ok: true });
  expect(requirePlatformAdmin).toHaveBeenCalledWith("acct-1");
  expect(createRegisteredCollector).toHaveBeenCalledWith(input, "alice");
});

test("createCollectorAction normalizes a blank caCert to undefined", async () => {
  createRegisteredCollector.mockResolvedValueOnce("c1");
  await createCollectorAction({ ...input, caCert: "" });
  expect(createRegisteredCollector.mock.calls[0][0].caCert).toBeUndefined();
});

test("updateCollectorAction passes the id and normalized input through", async () => {
  await updateCollectorAction("c1", { ...input, bearerToken: "" });
  expect(updateRegisteredCollector).toHaveBeenCalledWith(
    "c1",
    expect.objectContaining({ bearerToken: undefined }),
    "alice",
  );
});

test("deleteCollectorAction deletes by id", async () => {
  await expect(deleteCollectorAction("c1")).resolves.toEqual({ ok: true });
  expect(deleteRegisteredCollector).toHaveBeenCalledWith("c1");
});
