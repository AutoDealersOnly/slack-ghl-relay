import { afterEach, describe, expect, it } from "vitest";
import { hasPinCodeLookupAccess } from "./pin-code-lookup-access";

const originalAccessToken = process.env.PIN_CODE_LOOKUP_ACCESS_TOKEN;

afterEach(() => {
  if (originalAccessToken === undefined) {
    delete process.env.PIN_CODE_LOOKUP_ACCESS_TOKEN;
  } else {
    process.env.PIN_CODE_LOOKUP_ACCESS_TOKEN = originalAccessToken;
  }
});

describe("PIN Code Lookup private menu access", () => {
  it("accepts only the configured private access value", () => {
    process.env.PIN_CODE_LOOKUP_ACCESS_TOKEN = "test-private-access";

    expect(hasPinCodeLookupAccess("test-private-access")).toBe(true);
    expect(hasPinCodeLookupAccess("different-access")).toBe(false);
    expect(hasPinCodeLookupAccess("")).toBe(false);
  });

  it("rejects all requests when no access value is configured", () => {
    delete process.env.PIN_CODE_LOOKUP_ACCESS_TOKEN;

    expect(hasPinCodeLookupAccess("test-private-access")).toBe(false);
  });
});
