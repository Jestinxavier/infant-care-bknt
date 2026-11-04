const crypto = require("crypto");

/**
 * Encrypt secrets (API keys) before they go into the database.
 *
 * AES-256-GCM with a master key that lives only in the server environment
 * (SETTINGS_ENCRYPTION_KEY), so a database dump or backup alone never
 * reveals the secret. Any string works as the master key; it is stretched to
 * 32 bytes with SHA-256. Changing it makes stored secrets unreadable, so
 * they'd need to be entered again.
 */

const masterKey = () => {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw || raw.trim().length < 16) return null;
  return crypto.createHash("sha256").update(raw.trim()).digest();
};

const isEncryptionConfigured = () => masterKey() !== null;

const encryptSecret = (plain) => {
  const key = masterKey();
  if (!key) throw new Error("SETTINGS_ENCRYPTION_KEY is not set");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
};

const decryptSecret = ({ ciphertext, iv, tag }) => {
  const key = masterKey();
  if (!key) throw new Error("SETTINGS_ENCRYPTION_KEY is not set");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
};

module.exports = { isEncryptionConfigured, encryptSecret, decryptSecret };
