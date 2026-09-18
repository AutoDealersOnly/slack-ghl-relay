import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET?.trim() ?? "";
  if (!secret) throw new Error("The server encryption key is unavailable.");
  return createHash("sha256").update(`office-at-hand-test:${secret}`).digest();
}

/** Encrypts renewable provider credentials before database persistence. */
export function encryptOfficeAtHandSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString("base64url")).join(".");
}

/** Decrypts a credential only inside the server process immediately before provider use. */
export function decryptOfficeAtHandSecret(ciphertext: string): string {
  const [ivEncoded, tagEncoded, payloadEncoded, extra] = ciphertext.split(".");
  if (!ivEncoded || !tagEncoded || !payloadEncoded || extra) throw new Error("Stored OfficeAtHand authorization is invalid.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivEncoded, "base64url"));
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(payloadEncoded, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Stored OfficeAtHand authorization cannot be decrypted.");
  }
}
