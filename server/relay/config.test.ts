import { afterEach, describe, expect, it } from "vitest";
import { getRelayReadiness } from "./config";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("relay configuration readiness", () => {
  it("reports configuration status without returning a setting value", () => {
    process.env.GHL_API_KEY = "private-api-key";
    const readiness = getRelayReadiness();
    const apiKeyStatus = readiness.find(item => item.key === "GHL_API_KEY");

    expect(apiKeyStatus).toEqual({
      key: "GHL_API_KEY",
      label: "ADO GoHighLevel API key",
      configured: true,
    });
    expect(JSON.stringify(readiness)).not.toContain("private-api-key");
  });
});
