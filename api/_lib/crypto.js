import crypto from "node:crypto";

// AES-256-GCM at rest for Mercado Pago OAuth tokens - payment_settings is
// RLS-protected already, but access/refresh tokens are high-value secrets
// (they move real money) and deserve encryption at rest as defense in
// depth, not just reliance on RLS.
function getKey() {
  const raw = process.env.PAYMENT_TOKENS_ENCRYPTION_KEY;
  if (!raw) throw new Error("PAYMENT_TOKENS_ENCRYPTION_KEY not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("PAYMENT_TOKENS_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 of a 256-bit key)");
  }
  return key;
}

export function encryptSecret(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptSecret(payload) {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
