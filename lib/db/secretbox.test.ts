// @vitest-environment node
import { expect, test, vi } from "vitest";

const config = { dashboardEncryptionKey: "k".repeat(32) };
vi.mock("../config", () => ({ getConfig: () => config }));

const { encrypt, decrypt } = await import("./secretbox");

test("round-trips a secret", () => {
  expect(decrypt(encrypt("webui_priv.pem contents"))).toBe("webui_priv.pem contents");
});

test("round-trips an empty string", () => {
  expect(decrypt(encrypt(""))).toBe("");
});

test("two encryptions of the same plaintext are not identical (random nonce)", () => {
  const a = encrypt("same secret");
  const b = encrypt("same secret");
  expect(a.equals(b)).toBe(false);
  expect(decrypt(a)).toBe("same secret");
  expect(decrypt(b)).toBe("same secret");
});

test("a tampered blob fails to decrypt", () => {
  const blob = encrypt("webui key");
  const tampered = Buffer.from(blob);
  tampered[tampered.length - 1] ^= 0xff;
  expect(() => decrypt(tampered)).toThrow();
});

test("decrypting with the wrong key fails", () => {
  const blob = encrypt("webui key");
  config.dashboardEncryptionKey = "different-key-".padEnd(32, "x");
  expect(() => decrypt(blob)).toThrow();
  config.dashboardEncryptionKey = "k".repeat(32);
});
