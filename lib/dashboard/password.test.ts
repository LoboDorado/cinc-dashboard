// @vitest-environment node
import { expect, test } from "vitest";
import { hashPassword, verifyPassword } from "./password";

test("a correct password verifies", async () => {
  const hash = await hashPassword("correct horse battery staple");
  expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
});

test("an incorrect password does not verify", async () => {
  const hash = await hashPassword("correct horse battery staple");
  expect(await verifyPassword("wrong password", hash)).toBe(false);
});

test("two hashes of the same password are not identical (random salt)", async () => {
  const a = await hashPassword("same password");
  const b = await hashPassword("same password");
  expect(a).not.toBe(b);
  expect(await verifyPassword("same password", a)).toBe(true);
  expect(await verifyPassword("same password", b)).toBe(true);
});

test("a malformed stored hash fails closed instead of throwing", async () => {
  expect(await verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  expect(await verifyPassword("anything", "")).toBe(false);
});
