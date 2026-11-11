// @vitest-environment node
import { expect, test } from "vitest";
import {
  OBJECT_TYPES,
  canAccessObject,
  canAccessScope,
  canViewAssignments,
  isScopeAdmin,
  isPlatformAdmin,
  isPlatformMember,
  grantableRoles,
  type RoleGrant,
} from "./policy";

const SERVER_A = "server-a";
const SERVER_B = "server-b";

function grant(partial: Partial<RoleGrant> & Pick<RoleGrant, "role">): RoleGrant {
  return { serverId: null, org: null, objectTypes: [], ...partial };
}

test("no grants means no access", () => {
  expect(canAccessObject([], SERVER_A, "acme", "nodes", "read")).toBe(false);
  expect(canAccessScope([], SERVER_A)).toBe(false);
});

test("platform_admin can do anything, anywhere", () => {
  const grants = [grant({ role: "platform_admin" })];
  expect(canAccessObject(grants, SERVER_A, "acme", "nodes", "write")).toBe(true);
  expect(canAccessObject(grants, SERVER_B, "other-org", "policy_groups", "write")).toBe(true);
  expect(canAccessScope(grants, SERVER_B, "anything")).toBe(true);
  expect(canViewAssignments(grants)).toBe(true);
});

test("platform_read_only can read anywhere but never write", () => {
  const grants = [grant({ role: "platform_read_only" })];
  expect(canAccessObject(grants, SERVER_A, "acme", "nodes", "read")).toBe(true);
  expect(canAccessObject(grants, SERVER_A, "acme", "nodes", "write")).toBe(false);
  expect(canViewAssignments(grants)).toBe(false);
});

test("server_admin has full access across every org on their server, none on another", () => {
  const grants = [grant({ role: "server_admin", serverId: SERVER_A })];
  expect(canAccessObject(grants, SERVER_A, "acme", "nodes", "write")).toBe(true);
  expect(canAccessObject(grants, SERVER_A, "other-org", "roles", "write")).toBe(true);
  expect(canAccessObject(grants, SERVER_B, "acme", "nodes", "read")).toBe(false);
  expect(canViewAssignments(grants, SERVER_A)).toBe(true);
  expect(canViewAssignments(grants, SERVER_B)).toBe(false);
});

test("server_viewer reads everywhere on their server, writes nowhere", () => {
  const grants = [grant({ role: "server_viewer", serverId: SERVER_A })];
  expect(canAccessObject(grants, SERVER_A, "acme", "nodes", "read")).toBe(true);
  expect(canAccessObject(grants, SERVER_A, "acme", "nodes", "write")).toBe(false);
  expect(canViewAssignments(grants, SERVER_A)).toBe(false);
});

test("server_object_manager writes only its configured object types, reads everything, across every org on its server", () => {
  const grants = [
    grant({ role: "server_object_manager", serverId: SERVER_A, objectTypes: ["nodes"] }),
  ];
  expect(canAccessObject(grants, SERVER_A, "acme", "nodes", "write")).toBe(true);
  expect(canAccessObject(grants, SERVER_A, "other-org", "nodes", "write")).toBe(true);
  expect(canAccessObject(grants, SERVER_A, "acme", "roles", "write")).toBe(false);
  expect(canAccessObject(grants, SERVER_A, "acme", "roles", "read")).toBe(true);
  expect(canAccessObject(grants, SERVER_B, "acme", "nodes", "read")).toBe(false);
});

test("org_admin has full access within their one org only", () => {
  const grants = [grant({ role: "org_admin", serverId: SERVER_A, org: "acme" })];
  expect(canAccessObject(grants, SERVER_A, "acme", "nodes", "write")).toBe(true);
  expect(canAccessObject(grants, SERVER_A, "other-org", "nodes", "write")).toBe(false);
  expect(canAccessObject(grants, SERVER_B, "acme", "nodes", "write")).toBe(false);
  expect(canViewAssignments(grants, SERVER_A, "acme")).toBe(true);
  expect(canViewAssignments(grants, SERVER_A, "other-org")).toBe(false);
});

test("org_viewer reads within their one org only, never writes", () => {
  const grants = [grant({ role: "org_viewer", serverId: SERVER_A, org: "acme" })];
  expect(canAccessObject(grants, SERVER_A, "acme", "nodes", "read")).toBe(true);
  expect(canAccessObject(grants, SERVER_A, "acme", "nodes", "write")).toBe(false);
  expect(canAccessObject(grants, SERVER_A, "other-org", "nodes", "read")).toBe(false);
});

test("org_object_manager writes only its configured object types within its one org", () => {
  const grants = [
    grant({
      role: "org_object_manager",
      serverId: SERVER_A,
      org: "acme",
      objectTypes: ["cookbooks", "policies"],
    }),
  ];
  expect(canAccessObject(grants, SERVER_A, "acme", "cookbooks", "write")).toBe(true);
  expect(canAccessObject(grants, SERVER_A, "acme", "nodes", "write")).toBe(false);
  expect(canAccessObject(grants, SERVER_A, "acme", "nodes", "read")).toBe(true);
  expect(canAccessObject(grants, SERVER_A, "other-org", "cookbooks", "write")).toBe(false);
});

test("Groups and Sandboxes are not grantable object types (not delegable via Object Manager)", () => {
  expect(OBJECT_TYPES).not.toContain("groups");
  expect(OBJECT_TYPES).not.toContain("sandboxes");
});

test("a broader grant satisfies a narrower scope check even without an exact org match", () => {
  const grants = [grant({ role: "server_admin", serverId: SERVER_A })];
  expect(canAccessScope(grants, SERVER_A)).toBe(true);
  expect(canAccessScope(grants, SERVER_A, "any-org-at-all")).toBe(true);
  expect(canAccessScope(grants, SERVER_B)).toBe(false);
});

test("isScopeAdmin is true for platform/server/org admin tiers covering the scope, false for anything else", () => {
  expect(isScopeAdmin([grant({ role: "platform_admin" })], SERVER_A, "acme")).toBe(true);
  expect(isScopeAdmin([grant({ role: "server_admin", serverId: SERVER_A })], SERVER_A, "acme")).toBe(
    true,
  );
  expect(
    isScopeAdmin([grant({ role: "org_admin", serverId: SERVER_A, org: "acme" })], SERVER_A, "acme"),
  ).toBe(true);
  expect(
    isScopeAdmin([grant({ role: "org_admin", serverId: SERVER_A, org: "other-org" })], SERVER_A, "acme"),
  ).toBe(false);
  expect(
    isScopeAdmin(
      [grant({ role: "org_object_manager", serverId: SERVER_A, org: "acme", objectTypes: ["nodes"] })],
      SERVER_A,
      "acme",
    ),
  ).toBe(false);
  expect(isScopeAdmin([grant({ role: "server_viewer", serverId: SERVER_A })], SERVER_A, "acme")).toBe(
    false,
  );
});

test("isPlatformAdmin/isPlatformMember distinguish the two platform tiers", () => {
  expect(isPlatformAdmin([grant({ role: "platform_admin" })])).toBe(true);
  expect(isPlatformAdmin([grant({ role: "platform_read_only" })])).toBe(false);
  expect(isPlatformMember([grant({ role: "platform_admin" })])).toBe(true);
  expect(isPlatformMember([grant({ role: "platform_read_only" })])).toBe(true);
  expect(isPlatformMember([grant({ role: "server_admin", serverId: SERVER_A })])).toBe(false);
});

// -- grantableRoles --

test("a platform_admin can grant anything at any scope", () => {
  const grants = [grant({ role: "platform_admin" })];
  expect(grantableRoles(grants, { kind: "platform" })).toEqual([
    "platform_admin",
    "platform_read_only",
  ]);
  expect(grantableRoles(grants, { kind: "server", serverId: SERVER_A })).toEqual([
    "server_admin",
    "server_object_manager",
    "server_viewer",
  ]);
  expect(grantableRoles(grants, { kind: "org", serverId: SERVER_A, org: "acme" })).toEqual([
    "org_admin",
    "org_object_manager",
    "org_viewer",
  ]);
});

test("a server_admin can grant server/org roles on their own server, but no platform role and no peer server_admin", () => {
  const grants = [grant({ role: "server_admin", serverId: SERVER_A })];
  expect(grantableRoles(grants, { kind: "platform" })).toEqual([]);
  const serverGrantable = grantableRoles(grants, { kind: "server", serverId: SERVER_A });
  expect(serverGrantable).toEqual(["server_object_manager", "server_viewer"]);
  expect(serverGrantable).not.toContain("server_admin");
  expect(grantableRoles(grants, { kind: "org", serverId: SERVER_A, org: "acme" })).toEqual([
    "org_admin",
    "org_object_manager",
    "org_viewer",
  ]);
  // No authority at all on a different server.
  expect(grantableRoles(grants, { kind: "server", serverId: SERVER_B })).toEqual([]);
});

test("an org_admin can grant org roles in their own org only, never org_admin itself", () => {
  const grants = [grant({ role: "org_admin", serverId: SERVER_A, org: "acme" })];
  const orgGrantable = grantableRoles(grants, { kind: "org", serverId: SERVER_A, org: "acme" });
  expect(orgGrantable).toEqual(["org_object_manager", "org_viewer"]);
  expect(orgGrantable).not.toContain("org_admin");
  expect(grantableRoles(grants, { kind: "server", serverId: SERVER_A })).toEqual([]);
  expect(grantableRoles(grants, { kind: "org", serverId: SERVER_A, org: "other-org" })).toEqual([]);
});

test("an object manager or viewer can delegate nothing", () => {
  const grants = [
    grant({ role: "server_object_manager", serverId: SERVER_A, objectTypes: ["nodes"] }),
    grant({ role: "org_viewer", serverId: SERVER_A, org: "acme" }),
  ];
  expect(grantableRoles(grants, { kind: "server", serverId: SERVER_A })).toEqual([]);
  expect(grantableRoles(grants, { kind: "org", serverId: SERVER_A, org: "acme" })).toEqual([]);
});

test("multiple grants on the same account combine additively", () => {
  const grants = [
    grant({ role: "org_admin", serverId: SERVER_A, org: "acme" }),
    grant({ role: "org_viewer", serverId: SERVER_B, org: "other-org" }),
  ];
  expect(canAccessObject(grants, SERVER_A, "acme", "nodes", "write")).toBe(true);
  expect(canAccessObject(grants, SERVER_B, "other-org", "nodes", "read")).toBe(true);
  expect(canAccessObject(grants, SERVER_B, "other-org", "nodes", "write")).toBe(false);
});
