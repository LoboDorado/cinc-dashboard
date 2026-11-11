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

import { saveEnvironment, createEnvironment, deleteEnvironment } from "./actions";

beforeEach(() => {
  requireObjectAccess.mockClear();
  update.mockReset();
  create.mockReset();
  remove.mockReset();
});

test("saveEnvironment translates 403 into a forbidden result", async () => {
  update.mockRejectedValueOnce(new CincError(403, "denied"));
  await expect(saveEnvironment("s1", "acme", "prod", '{"name":"prod"}')).resolves.toEqual({
    error: "forbidden",
  });
});

test("saveEnvironment rejects invalid JSON without calling the server", async () => {
  await expect(saveEnvironment("s1", "acme", "prod", "{not json")).resolves.toEqual({
    error: "invalid JSON",
  });
  expect(update).not.toHaveBeenCalled();
});

test("saveEnvironment saves valid JSON", async () => {
  update.mockResolvedValueOnce({});
  await expect(saveEnvironment("s1", "acme", "prod", '{"name":"prod"}')).resolves.toEqual({
    ok: true,
  });
  expect(requireObjectAccess).toHaveBeenCalledWith("acct-1", "s1", "acme", "environments", "write");
  expect(update).toHaveBeenCalledWith("ctx", "prod", { name: "prod" });
});

test("createEnvironment injects the name", async () => {
  create.mockResolvedValueOnce({});
  await createEnvironment("s1", "acme", "staging", '{"description":""}');
  expect(create).toHaveBeenCalledWith("ctx", { description: "", name: "staging" });
});

test("deleteEnvironment removes by name", async () => {
  remove.mockResolvedValueOnce({});
  await expect(deleteEnvironment("s1", "acme", "prod")).resolves.toEqual({ ok: true });
  expect(remove).toHaveBeenCalledWith("ctx", "prod");
});
