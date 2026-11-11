// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";
import { revalidatePath } from "next/cache";
import { CincError } from "@/lib/cinc/errors";

vi.mock("@/lib/guard", () => ({ currentAccountId: async () => "acct-1" }));

const { requireObjectAccess, deleteCookbook, deleteCookbookVersion } = vi.hoisted(() => ({
  requireObjectAccess: vi.fn(async () => "ctx"),
  deleteCookbook: vi.fn(),
  deleteCookbookVersion: vi.fn(),
}));
vi.mock("@/lib/admin/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/access")>()),
  requireObjectAccess,
}));
vi.mock("@/lib/cinc/cookbooks", () => ({ deleteCookbook, deleteCookbookVersion }));

import {
  deleteCookbookAction,
  deleteCookbookVersionAction,
} from "./actions";

beforeEach(() => {
  requireObjectAccess.mockClear();
  deleteCookbook.mockReset();
  deleteCookbookVersion.mockReset();
  vi.mocked(revalidatePath).mockClear();
});

test("deletes a single version and revalidates", async () => {
  deleteCookbookVersion.mockResolvedValueOnce(undefined);
  await expect(deleteCookbookVersionAction("s1", "acme", "nginx", "1.2.0")).resolves.toEqual({
    ok: true,
  });
  expect(requireObjectAccess).toHaveBeenCalledWith("acct-1", "s1", "acme", "cookbooks", "write");
  expect(deleteCookbookVersion).toHaveBeenCalledWith("ctx", "nginx", "1.2.0");
  expect(revalidatePath).toHaveBeenCalledWith("/servers/s1/orgs/acme/cookbooks", "layout");
});

test("deletes the whole cookbook", async () => {
  deleteCookbook.mockResolvedValueOnce(undefined);
  await expect(deleteCookbookAction("s1", "acme", "nginx")).resolves.toEqual({ ok: true });
  expect(deleteCookbook).toHaveBeenCalledWith("ctx", "nginx");
});

test("maps 403 to forbidden and does not revalidate", async () => {
  deleteCookbook.mockRejectedValueOnce(new CincError(403, "denied"));
  await expect(deleteCookbookAction("s1", "acme", "nginx")).resolves.toEqual({
    error: "forbidden",
  });
  expect(revalidatePath).not.toHaveBeenCalled();
});
