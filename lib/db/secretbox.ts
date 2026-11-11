// Encrypts secrets at rest in the dashboard's own database (registered
// servers' webui keys, registered collectors' bearer tokens) with
// CINC_DASHBOARD_ENCRYPTION_KEY. Kept independent from SESSION_SECRET --
// rotating one shouldn't force re-encrypting the other -- and this key can't
// itself live in the database it protects, hence an env var.
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getConfig } from "../config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, the size GCM is designed for
const AUTH_TAG_LENGTH = 16;

/**
 * CINC_DASHBOARD_ENCRYPTION_KEY is an arbitrary-length passphrase (same
 * >=32-char convention as SESSION_SECRET), not raw key bytes -- hash it down
 * to the fixed 32 bytes AES-256 requires.
 */
function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** Encrypts `plaintext`, returning an opaque `iv‖authTag‖ciphertext` blob. */
export function encrypt(plaintext: string): Buffer {
  const key = deriveKey(getConfig().dashboardEncryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/**
 * Reverses `encrypt`. Throws if the key is wrong or `blob` was altered --
 * GCM's auth tag check fails closed rather than returning corrupted text.
 */
export function decrypt(blob: Buffer): string {
  const key = deriveKey(getConfig().dashboardEncryptionKey);
  const iv = blob.subarray(0, IV_LENGTH);
  const authTag = blob.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
