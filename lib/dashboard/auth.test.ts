// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";

const { query, config, ldapBindMock } = vi.hoisted(() => ({
  query: vi.fn(),
  config: { authMode: "local" as "local" | "ldap" },
  ldapBindMock: vi.fn(),
}));

vi.mock("../db/client", () => ({ getPool: () => ({ query }) }));
vi.mock("../config", () => ({ getConfig: () => config }));
vi.mock("../ldap/client", async () => {
  const actual = await vi.importActual<typeof import("../ldap/client")>("../ldap/client");
  return { ...actual, ldapBind: ldapBindMock };
});

import { authenticate } from "./auth";
import { hashPassword } from "./password";
import { LdapAuthError } from "../ldap/client";

afterEach(() => {
  query.mockReset();
  ldapBindMock.mockReset();
  config.authMode = "local";
});

test("unknown username fails closed", async () => {
  query.mockResolvedValueOnce({ rows: [] });
  expect(await authenticate("ghost", "whatever")).toBeNull();
});

test("a local account with the correct password succeeds", async () => {
  const hash = await hashPassword("s3cret-password");
  query.mockResolvedValueOnce({
    rows: [
      {
        id: "acct-1",
        username: "alice",
        display_name: "Alice",
        auth_source: "local",
        password_hash: hash,
        ldap_dn: null,
      },
    ],
  });
  const result = await authenticate("alice", "s3cret-password");
  expect(result).toEqual({ id: "acct-1", username: "alice", displayName: "Alice" });
});

test("a local account with the wrong password fails", async () => {
  const hash = await hashPassword("s3cret-password");
  query.mockResolvedValueOnce({
    rows: [
      {
        id: "acct-1",
        username: "alice",
        display_name: "Alice",
        auth_source: "local",
        password_hash: hash,
        ldap_dn: null,
      },
    ],
  });
  expect(await authenticate("alice", "wrong-password")).toBeNull();
});

test("an ldap account fails when AUTH_MODE is not ldap", async () => {
  query.mockResolvedValueOnce({
    rows: [
      {
        id: "acct-2",
        username: "bob",
        display_name: "Bob",
        auth_source: "ldap",
        password_hash: null,
        ldap_dn: "uid=bob,dc=example,dc=com",
      },
    ],
  });
  config.authMode = "local";
  expect(await authenticate("bob", "whatever")).toBeNull();
  expect(ldapBindMock).not.toHaveBeenCalled();
});

test("an ldap account succeeds when the bound DN matches the linked DN", async () => {
  query.mockResolvedValueOnce({
    rows: [
      {
        id: "acct-2",
        username: "bob",
        display_name: "Bob",
        auth_source: "ldap",
        password_hash: null,
        ldap_dn: "uid=bob,dc=example,dc=com",
      },
    ],
  });
  config.authMode = "ldap";
  ldapBindMock.mockResolvedValueOnce({ dn: "uid=bob,dc=example,dc=com" });
  const result = await authenticate("bob", "directory-password");
  expect(result).toEqual({ id: "acct-2", username: "bob", displayName: "Bob" });
});

test("an ldap account fails if the bind resolves to a different DN than it's linked to", async () => {
  query.mockResolvedValueOnce({
    rows: [
      {
        id: "acct-2",
        username: "bob",
        display_name: "Bob",
        auth_source: "ldap",
        password_hash: null,
        ldap_dn: "uid=bob,dc=example,dc=com",
      },
    ],
  });
  config.authMode = "ldap";
  ldapBindMock.mockResolvedValueOnce({ dn: "uid=someone-else,dc=example,dc=com" });
  expect(await authenticate("bob", "directory-password")).toBeNull();
});

test("a failed ldap bind fails closed", async () => {
  query.mockResolvedValueOnce({
    rows: [
      {
        id: "acct-2",
        username: "bob",
        display_name: "Bob",
        auth_source: "ldap",
        password_hash: null,
        ldap_dn: "uid=bob,dc=example,dc=com",
      },
    ],
  });
  config.authMode = "ldap";
  ldapBindMock.mockRejectedValueOnce(new LdapAuthError("invalid_credentials"));
  expect(await authenticate("bob", "wrong")).toBeNull();
});
