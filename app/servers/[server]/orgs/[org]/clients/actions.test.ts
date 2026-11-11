// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";
import { revalidatePath } from "next/cache";
import { CincError } from "@/lib/cinc/errors";

vi.mock("@/lib/guard", () => ({ currentAccountId: async () => "acct-1" }));

const { requireObjectAccess, createClient, deleteClient } = vi.hoisted(() => ({
  requireObjectAccess: vi.fn(async () => "ctx"),
  createClient: vi.fn(),
  deleteClient: vi.fn(),
}));
vi.mock("@/lib/admin/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/access")>()),
  requireObjectAccess,
}));
vi.mock("@/lib/cinc/clients", () => ({ createClient, deleteClient }));

import { createClientAction, deleteClientAction } from "./actions";

beforeEach(() => {
  requireObjectAccess.mockClear();
  createClient.mockReset();
  deleteClient.mockReset();
  vi.mocked(revalidatePath).mockClear();
});

test("returns the one-time private key and revalidates the list", async () => {
  createClient.mockResolvedValueOnce({ name: "ci", privateKey: "PEMKEY" });
  await expect(createClientAction("s1", "acme", "ci")).resolves.toEqual({
    ok: true,
    privateKey: "PEMKEY",
  });
  expect(requireObjectAccess).toHaveBeenCalledWith("acct-1", "s1", "acme", "clients", "write");
  expect(createClient).toHaveBeenCalledWith("ctx", "ci");
  expect(revalidatePath).toHaveBeenCalledWith("/servers/s1/orgs/acme/clients", "layout");
});

test("maps a name conflict to a friendly error and does not revalidate", async () => {
  createClient.mockRejectedValueOnce(new CincError(409, "exists"));
  await expect(createClientAction("s1", "acme", "ci")).resolves.toEqual({
    error: "already exists",
  });
  expect(revalidatePath).not.toHaveBeenCalled();
});

test("maps 403 to forbidden", async () => {
  createClient.mockRejectedValueOnce(new CincError(403, "denied"));
  await expect(createClientAction("s1", "acme", "ci")).resolves.toEqual({
    error: "forbidden",
  });
});

test("maps a role-grant denial to forbidden", async () => {
  requireObjectAccess.mockRejectedValueOnce(
    new (await import("@/lib/admin/access")).AccessDeniedError(),
  );
  await expect(createClientAction("s1", "acme", "ci")).resolves.toEqual({
    error: "forbidden",
  });
});

test("deleteClientAction removes the client and revalidates", async () => {
  deleteClient.mockResolvedValueOnce(undefined);
  await expect(deleteClientAction("s1", "acme", "ci")).resolves.toEqual({ ok: true });
  expect(deleteClient).toHaveBeenCalledWith("ctx", "ci");
  expect(revalidatePath).toHaveBeenCalledWith("/servers/s1/orgs/acme/clients", "layout");
});

test("deleteClientAction maps 403 to forbidden", async () => {
  deleteClient.mockRejectedValueOnce(new CincError(403, "denied"));
  await expect(deleteClientAction("s1", "acme", "ci")).resolves.toEqual({
    error: "forbidden",
  });
});
