import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { makeWebhookDeliveryKey, normalizeCampaignChannelName } from "./naming";
import { isAuthorizedGhlWebhook, isAuthorizedSlackRequest, redactErrorDetail } from "./security";

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

describe("Slack request authorization", () => {
  it("accepts a current Slack signature built from the unmodified body", () => {
    const timestamp = "1760000000";
    const rawBody = "command=%2Fghl&channel_id=C123";
    const secret = "signing-secret";
    const signature = `v0=${crypto.createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;

    expect(
      isAuthorizedSlackRequest({ signingSecret: secret, timestamp, signature, rawBody, nowMs: 1760000000000 })
    ).toBe(true);
  });

  it("rejects stale or altered Slack requests", () => {
    expect(
      isAuthorizedSlackRequest({
        signingSecret: "signing-secret",
        timestamp: "1760000000",
        signature: "v0=not-valid",
        rawBody: "command=%2Fghl",
        nowMs: 1760000400000,
      })
    ).toBe(false);
  });
});
