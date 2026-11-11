// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";
import { revalidatePath } from "next/cache";
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

import { saveNode, createNode, deleteNode } from "./actions";

beforeEach(() => {
  requireObjectAccess.mockClear();
  update.mockReset();
  create.mockReset();
  remove.mockReset();
});

test("saveNode translates 403 into a forbidden result", async () => {
  update.mockRejectedValueOnce(new CincError(403, "denied"));
  await expect(saveNode("s1", "acme", "web01", '{"name":"web01"}')).resolves.toEqual({
    error: "forbidden",
  });
});

test("saveNode rejects invalid JSON without checking access or calling the server", async () => {
  await expect(saveNode("s1", "acme", "web01", "{not json")).resolves.toEqual({
    error: "invalid JSON",
  });
  expect(requireObjectAccess).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});

test("saveNode checks write access on nodes before saving", async () => {
  update.mockResolvedValueOnce({});
  await expect(saveNode("s1", "acme", "web01", '{"name":"web01"}')).resolves.toEqual({
    ok: true,
  });
  expect(requireObjectAccess).toHaveBeenCalledWith("acct-1", "s1", "acme", "nodes", "write");
  expect(update).toHaveBeenCalledWith("ctx", "web01", { name: "web01" });
});

test("createNode injects the name", async () => {
  create.mockResolvedValueOnce({});
  await createNode("s1", "acme", "web02", '{"run_list":[]}');
  expect(create).toHaveBeenCalledWith("ctx", { run_list: [], name: "web02" });
});

test("deleteNode removes by name", async () => {
  remove.mockResolvedValueOnce({});
  await expect(deleteNode("s1", "acme", "web01")).resolves.toEqual({ ok: true });
  expect(remove).toHaveBeenCalledWith("ctx", "web01");
});

test("deleteNode revalidates the nodes list so the deleted node disappears", async () => {
  remove.mockResolvedValueOnce({});
  await deleteNode("s1", "acme", "web01");
  expect(revalidatePath).toHaveBeenCalledWith("/servers/s1/orgs/acme/nodes", "layout");
});

test("a failed mutation does not revalidate", async () => {
  vi.mocked(revalidatePath).mockClear();
  remove.mockRejectedValueOnce(new CincError(403, "denied"));
  await deleteNode("s1", "acme", "web01");
  expect(revalidatePath).not.toHaveBeenCalled();
});
