import { describe, expect, it } from "vitest";
import { normalizeGhlPrivateIntegrationToken } from "./config";

const runShapeCheck = process.env.RUN_LIVE_GHL_TOKEN_SHAPE_CHECK === "true";

describe.skipIf(!runShapeCheck)("ADO token delivery", () => {
  it("receives a non-empty private-integration-formatted token without exposing it", () => {
    const key = process.env.GHL_API_KEY ?? "";

    const hasExpectedPrivateIntegrationShape =
      key.length > 24 && /^pit-[a-zA-Z0-9-]+$/i.test(key) && !/\s/.test(key);

    if (!hasExpectedPrivateIntegrationShape) {
      throw new Error("ADO token delivery does not have the expected private-integration shape.");
    }

    expect(normalizeGhlPrivateIntegrationToken(key).startsWith("pit-")).toBe(true);
  });
});
