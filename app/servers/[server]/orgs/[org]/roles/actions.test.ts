// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";
import { CincError } from "@/lib/cinc/errors";

vi.mock("@/lib/guard", () => ({ currentAccountId: async () => "acct-1" }));

const { requireObjectAccess, update, create, remove } = vi.hoisted(() => ({
  requireObjectAccess: vi.fn(async () => "ctx"),
  update: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/admin/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/access")>()),
  requireObjectAccess,
}));
vi.mock("@/lib/cinc/resource", () => ({
  makeResource: () => ({ update, create, remove }),
}));

import { saveRole, createRole, deleteRole } from "./actions";

beforeEach(() => {
  requireObjectAccess.mockClear();
  update.mockReset();
  create.mockReset();
  remove.mockReset();
});

test("saveRole translates 403 into a forbidden result", async () => {
  update.mockRejectedValueOnce(new CincError(403, "denied"));
  await expect(saveRole("s1", "acme", "web01", '{"name":"web01"}')).resolves.toEqual({
    error: "forbidden",
  });
});

test("saveRole rejects invalid JSON without calling the server", async () => {
  await expect(saveRole("s1", "acme", "web01", "{not json")).resolves.toEqual({
    error: "invalid JSON",
  });
  expect(update).not.toHaveBeenCalled();
});

test("saveRole saves valid JSON", async () => {
  update.mockResolvedValueOnce({});
  await expect(saveRole("s1", "acme", "web01", '{"name":"web01"}')).resolves.toEqual({
    ok: true,
  });
  expect(requireObjectAccess).toHaveBeenCalledWith("acct-1", "s1", "acme", "roles", "write");
  expect(update).toHaveBeenCalledWith("ctx", "web01", { name: "web01" });
});

test("createRole injects the name", async () => {
  create.mockResolvedValueOnce({});
  await createRole("s1", "acme", "web02", '{"run_list":[]}');
  expect(create).toHaveBeenCalledWith("ctx", { run_list: [], name: "web02" });
});

test("deleteRole removes by name", async () => {
  remove.mockResolvedValueOnce({});
  await expect(deleteRole("s1", "acme", "web01")).resolves.toEqual({ ok: true });
  expect(remove).toHaveBeenCalledWith("ctx", "web01");
});
