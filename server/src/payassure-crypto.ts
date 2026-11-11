import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export class PayassureDecryptionError extends Error {
  constructor() {
    super("Stored PayAssure data could not be decrypted");
    this.name = "PayassureDecryptionError";
  }
}

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required to protect PayAssure tokens");
  return createHash("sha256").update(secret).digest();
}

export function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64")).join(":");
}

export function decrypt(value: string | null): string | null {
  if (!value) return null;
  const key = encryptionKey();
  try {
    const parts = value.split(":");
    if (parts.length !== 3) throw new Error("Invalid encrypted value format");
    const [iv, authTag, encrypted] = parts.map((part) => Buffer.from(part, "base64"));
    if (iv.length !== 12 || authTag.length !== 16) {
      throw new Error("Invalid encrypted value parameters");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    throw new PayassureDecryptionError();
  }
}
