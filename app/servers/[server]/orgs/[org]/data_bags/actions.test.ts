// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";
import { CincError } from "@/lib/cinc/errors";

vi.mock("@/lib/guard", () => ({ currentAccountId: async () => "acct-1" }));

const { requireObjectAccess, putItem, createItem, removeItem, createBag, removeBag } = vi.hoisted(
  () => ({
    requireObjectAccess: vi.fn(async () => "ctx"),
    putItem: vi.fn(),
    createItem: vi.fn(),
    removeItem: vi.fn(),
    createBag: vi.fn(),
    removeBag: vi.fn(),
  }),
);
vi.mock("@/lib/admin/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/access")>()),
  requireObjectAccess,
}));
vi.mock("@/lib/cinc/databags", () => ({
  dataBags: { putItem, createItem, removeItem, createBag, removeBag },
}));

import {
  saveItem,
  createItem as createItemAction,
  deleteBag,
  createBag as createBagAction,
} from "./actions";

beforeEach(() => {
  requireObjectAccess.mockClear();
  putItem.mockReset();
  createItem.mockReset();
  removeItem.mockReset();
  createBag.mockReset();
  removeBag.mockReset();
});

test("saveItem translates 403 into a forbidden result", async () => {
  putItem.mockRejectedValueOnce(new CincError(403, "denied"));
  await expect(
    saveItem("s1", "acme", "users", "alice", '{"id":"alice"}'),
  ).resolves.toEqual({ error: "forbidden" });
});

test("saveItem rejects invalid JSON without calling the server", async () => {
  await expect(
    saveItem("s1", "acme", "users", "alice", "{not json"),
  ).resolves.toEqual({ error: "invalid JSON" });
  expect(putItem).not.toHaveBeenCalled();
});

test("saveItem saves valid JSON", async () => {
  putItem.mockResolvedValueOnce({});
  await expect(
    saveItem("s1", "acme", "users", "alice", '{"id":"alice"}'),
  ).resolves.toEqual({ ok: true });
  expect(requireObjectAccess).toHaveBeenCalledWith("acct-1", "s1", "acme", "data_bags", "write");
  expect(putItem).toHaveBeenCalledWith("ctx", "users", "alice", { id: "alice" });
});

test("createItem injects the id", async () => {
  createItem.mockResolvedValueOnce({});
  await createItemAction("s1", "acme", "users", "bob", '{"role":"admin"}');
  expect(createItem).toHaveBeenCalledWith("ctx", "users", { role: "admin", id: "bob" });
});

test("deleteBag calls removeBag", async () => {
  removeBag.mockResolvedValueOnce({});
  await expect(deleteBag("s1", "acme", "users")).resolves.toEqual({ ok: true });
  expect(removeBag).toHaveBeenCalledWith("ctx", "users");
});

test("createBag creates the bag by name", async () => {
  createBag.mockResolvedValueOnce({});
  await expect(createBagAction("s1", "acme", "users")).resolves.toEqual({ ok: true });
  expect(createBag).toHaveBeenCalledWith("ctx", "users");
});
