// @vitest-environment node
import { expect, test, vi } from "vitest";

const req = vi.fn();
vi.mock("./client", () => ({ cincRequest: (...a: unknown[]) => req(...a) }));

import { listAllOrgs } from "./orgs";
import { cincPath } from "./path";
import type { AuthorizedActionContext } from "../admin/access";

const ctx = { impersonationUsername: "pivotal" } as AuthorizedActionContext;

test("maps the { name: url } response into Org rows", async () => {
  req.mockResolvedValueOnce({
    acme: "https://s/organizations/acme",
    beta: "https://s/organizations/beta",
  });
  await expect(listAllOrgs(ctx)).resolves.toEqual([{ name: "acme" }, { name: "beta" }]);
  expect(req).toHaveBeenCalledWith(ctx, {
    method: "GET",
    path: cincPath`/organizations`,
  });
});
