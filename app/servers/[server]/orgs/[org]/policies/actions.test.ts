// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";
import { revalidatePath } from "next/cache";
import { CincError } from "@/lib/cinc/errors";

vi.mock("@/lib/guard", () => ({ currentAccountId: async () => "acct-1" }));

const { requireObjectAccess, deletePolicy, deletePolicyRevision } = vi.hoisted(() => ({
  requireObjectAccess: vi.fn(async () => "ctx"),
  deletePolicy: vi.fn(),
  deletePolicyRevision: vi.fn(),
}));
vi.mock("@/lib/admin/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/access")>()),
  requireObjectAccess,
}));
vi.mock("@/lib/cinc/policies", () => ({ deletePolicy, deletePolicyRevision }));

import { deletePolicyAction, deletePolicyRevisionAction } from "./actions";

beforeEach(() => {
  requireObjectAccess.mockClear();
  deletePolicy.mockReset();
  deletePolicyRevision.mockReset();
  vi.mocked(revalidatePath).mockClear();
});

test("deletes a single revision and revalidates", async () => {
  deletePolicyRevision.mockResolvedValueOnce(undefined);
  await expect(
    deletePolicyRevisionAction("s1", "acme", "web-app", "1.0.0"),
  ).resolves.toEqual({ ok: true });
  expect(requireObjectAccess).toHaveBeenCalledWith("acct-1", "s1", "acme", "policies", "write");
  expect(deletePolicyRevision).toHaveBeenCalledWith("ctx", "web-app", "1.0.0");
  expect(revalidatePath).toHaveBeenCalledWith("/servers/s1/orgs/acme/policies", "layout");
});

test("deletes the whole policy", async () => {
  deletePolicy.mockResolvedValueOnce(undefined);
  await expect(deletePolicyAction("s1", "acme", "web-app")).resolves.toEqual({ ok: true });
  expect(deletePolicy).toHaveBeenCalledWith("ctx", "web-app");
});

test("maps 403 to forbidden and does not revalidate", async () => {
  deletePolicy.mockRejectedValueOnce(new CincError(403, "denied"));
  await expect(deletePolicyAction("s1", "acme", "web-app")).resolves.toEqual({
    error: "forbidden",
  });
  expect(revalidatePath).not.toHaveBeenCalled();
});
