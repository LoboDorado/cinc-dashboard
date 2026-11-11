// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";
import type { ProfileDetails } from "./actions";

vi.mock("@/lib/guard", () => ({ currentAccountId: async () => "acct-1" }));

const { updateDisplayName, changeOwnPassword, LdapAccountPasswordError } = vi.hoisted(() => {
  class LdapAccountPasswordError extends Error {
    constructor() {
      super("password is managed by your organization's directory");
      this.name = "LdapAccountPasswordError";
    }
  }
  return {
    updateDisplayName: vi.fn(),
    changeOwnPassword: vi.fn(),
    LdapAccountPasswordError,
  };
});
vi.mock("@/lib/dashboard/accounts", () => ({
  updateDisplayName,
  changeOwnPassword,
  LdapAccountPasswordError,
}));

import { saveProfile, changePassword } from "./actions";

beforeEach(() => {
  updateDisplayName.mockReset();
  changeOwnPassword.mockReset();
});

test("saveProfile updates the account's display name", async () => {
  await expect(saveProfile({ display_name: "Anna B" })).resolves.toEqual({ ok: true });
  expect(updateDisplayName).toHaveBeenCalledWith("acct-1", "Anna B");
});

test("saveProfile writes only the field the form owns", async () => {
  // A Server Action is a public endpoint and its parameter type is erased at
  // runtime, so a caller can hand us any object. None of these may reach the
  // database update.
  await saveProfile({
    display_name: "Anna B",
    password: "hunter2",
    authSource: "local",
  } as ProfileDetails);
  expect(updateDisplayName).toHaveBeenCalledWith("acct-1", "Anna B");
  expect(updateDisplayName).toHaveBeenCalledTimes(1);
});

test("saveProfile rejects a non-string display name", async () => {
  await expect(
    saveProfile({ display_name: { toString: 1 } } as unknown as ProfileDetails),
  ).resolves.toEqual({ error: "invalid request" });
  expect(updateDisplayName).not.toHaveBeenCalled();
});

test("changePassword changes the account's own password", async () => {
  await expect(changePassword("s3cret-password")).resolves.toEqual({ ok: true });
  expect(changeOwnPassword).toHaveBeenCalledWith("acct-1", "s3cret-password");
});

test("changePassword rejects a short password without calling the database", async () => {
  await expect(changePassword("short")).resolves.toEqual({
    error: "password must be at least 12 characters",
  });
  expect(changeOwnPassword).not.toHaveBeenCalled();
});

test("changePassword rejects a non-string password", async () => {
  // `(123456).length < 12` is false, so a bare length check would let this
  // reach the database as a numeric password.
  await expect(changePassword(123456 as unknown as string)).resolves.toEqual({
    error: "password must be at least 12 characters",
  });
  expect(changeOwnPassword).not.toHaveBeenCalled();
});

test("changePassword surfaces the LDAP guard from the database layer", async () => {
  changeOwnPassword.mockRejectedValueOnce(new LdapAccountPasswordError());
  await expect(changePassword("s3cret-password")).resolves.toEqual({
    error: "password is managed by your organization's directory",
  });
});
