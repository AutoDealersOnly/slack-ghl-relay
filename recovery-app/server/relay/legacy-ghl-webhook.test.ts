import { describe, expect, it } from "vitest";
import { parseLegacyGhlWebhookPayload } from "./legacy-ghl-webhook";
import { selectLegacyHeaderlessHandler } from "./routes";

describe("legacy GHL Canvas-refresh webhook payload", () => {
  it("accepts the original lightweight Production-name payload", () => {
    expect(parseLegacyGhlWebhookPayload({ production_name: "2609 ABC Test AME" })).toEqual({
      production_name: "2609 ABC Test AME",
    });
  });

  it("retains an existing optional channel name without requiring a new field", () => {
    expect(
      parseLegacyGhlWebhookPayload({
        production_name: "2609 ABC Test AME",
        channel_name: "2609-abc-test-ame",
      })
    ).toEqual({
      production_name: "2609 ABC Test AME",
      channel_name: "2609-abc-test-ame",
    });
  });

  it("safely ignores an incomplete legacy delivery", () => {
    expect(parseLegacyGhlWebhookPayload({ channel_name: "2609-abc-test-ame" })).toBeNull();
  });

  it("directs unprotected Canvas, proof, and channel-creation deliveries to their separate legacy handlers", () => {
    expect(selectLegacyHeaderlessHandler("production_update", false)).toBe("canvas");
    expect(selectLegacyHeaderlessHandler("proof_status", false)).toBe("proof");
    expect(selectLegacyHeaderlessHandler("create_channel", false)).toBe("create");
    expect(selectLegacyHeaderlessHandler("production_update", true)).toBeNull();
    expect(selectLegacyHeaderlessHandler("proof_status", true)).toBeNull();
    expect(selectLegacyHeaderlessHandler("create_channel", true)).toBeNull();
  });
});
