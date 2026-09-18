import { afterEach, describe, expect, it } from "vitest";
import { activeCallWebhookValidationToken, buildActiveCallLookupTestUrl, hasActiveCallLookupTestAccess } from "./active-call-lookup-test-access";

const originalSecret = process.env.JWT_SECRET;

afterEach(() => {
  process.env.JWT_SECRET = originalSecret;
});

describe("separate active-call test access", () => {
  it("accepts only the independently derived active-call test value", () => {
    process.env.JWT_SECRET = "test-only-active-call-link-key";
    const url = new URL(buildActiveCallLookupTestUrl());
    const testAccess = url.searchParams.get("access");
    expect(hasActiveCallLookupTestAccess(testAccess)).toBe(true);
    expect(hasActiveCallLookupTestAccess("unrelated-live-pin-access")).toBe(false);
  });

  it("uses a provider-safe hexadecimal validation token for the separate webhook", () => {
    process.env.JWT_SECRET = "test-only-active-call-link-key";
    expect(activeCallWebhookValidationToken()).toMatch(/^[a-f0-9]{32}$/);
  });
});
