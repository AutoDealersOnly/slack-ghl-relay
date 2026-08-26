import { describe, expect, it } from "vitest";
import { makeWebhookDeliveryKey, normalizeCampaignChannelName } from "./naming";
import { isAuthorizedGhlWebhook, redactErrorDetail } from "./security";

describe("relay webhook authorization", () => {
  it("accepts the configured shared secret in a bearer header", () => {
    expect(isAuthorizedGhlWebhook("Bearer secure-shared-value", "secure-shared-value")).toBe(true);
  });

  it("rejects missing, malformed, and incorrect shared secrets", () => {
    expect(isAuthorizedGhlWebhook(undefined, "secure-shared-value")).toBe(false);
    expect(isAuthorizedGhlWebhook("Bearer incorrect-value", "secure-shared-value")).toBe(false);
    expect(isAuthorizedGhlWebhook("", "secure-shared-value")).toBe(false);
  });
});

describe("relay identifiers and safe diagnostics", () => {
  it("normalizes campaign names into consistent Slack channel names", () => {
    expect(normalizeCampaignChannelName("2609 Westshore Honda / AME!")).toBe("2609-westshore-honda-ame");
  });

  it("creates stable delivery keys for matching webhook payloads", () => {
    const payload = { production_name: "2609 Westshore Honda AME", proof_stage: "request_proof" };
    expect(makeWebhookDeliveryKey("proof_status", payload)).toBe(makeWebhookDeliveryKey("proof_status", payload));
  });

  it("redacts credentials and webhook addresses from diagnostic messages", () => {
    const detail = redactErrorDetail("Bearer xoxb-secret failed at https://hook.example.com/hidden");
    expect(detail).not.toContain("xoxb-secret");
    expect(detail).not.toContain("hook.example.com");
  });
});
