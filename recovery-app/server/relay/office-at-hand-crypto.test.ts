import { afterEach, describe, expect, it } from "vitest";
import { decryptOfficeAtHandSecret, encryptOfficeAtHandSecret } from "./office-at-hand-crypto";

const originalSecret = process.env.JWT_SECRET;

afterEach(() => {
  process.env.JWT_SECRET = originalSecret;
});

describe("OfficeAtHand authorization encryption", () => {
  it("round-trips a provider credential without retaining readable text in storage", () => {
    process.env.JWT_SECRET = "test-only-encryption-key";
    const encrypted = encryptOfficeAtHandSecret("temporary-provider-credential");
    expect(encrypted).not.toContain("temporary-provider-credential");
    expect(decryptOfficeAtHandSecret(encrypted)).toBe("temporary-provider-credential");
  });

  it("rejects a changed or malformed encrypted value", () => {
    process.env.JWT_SECRET = "test-only-encryption-key";
    const encrypted = encryptOfficeAtHandSecret("temporary-provider-credential");
    expect(() => decryptOfficeAtHandSecret(`${encrypted}x`)).toThrow("cannot be decrypted");
  });
});
