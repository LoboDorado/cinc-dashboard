import { expect, test } from "vitest";
import { listPath, newPath, objectPath, orgAdminPath, orgPath, serverAdminPath } from "./urls";

test("orgPath builds a scoped org route and encodes both segments", () => {
  expect(orgPath("s1", "acme")).toBe("/servers/s1/orgs/acme");
  expect(orgPath("s1", "my org")).toBe("/servers/s1/orgs/my%20org");
});

test("objectPath appends kind and name under the org path", () => {
  expect(objectPath("s1", "acme", "roles", "my-role")).toBe("/servers/s1/orgs/acme/roles/my-role");
  expect(objectPath("s1", "acme", "nodes", "a/b")).toBe("/servers/s1/orgs/acme/nodes/a%2Fb");
});

test("listPath and newPath are scope-free", () => {
  expect(listPath("roles")).toBe("/roles");
  expect(newPath("roles")).toBe("/roles/new");
});

test("orgAdminPath and serverAdminPath build admin surfaces", () => {
  expect(orgAdminPath("s1", "acme", "roles")).toBe("/servers/s1/orgs/acme/admin/roles");
  expect(orgAdminPath("s1", "acme", "audit")).toBe("/servers/s1/orgs/acme/admin/audit");
  expect(serverAdminPath("s1", "roles")).toBe("/servers/s1/admin/roles");
});
