import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { isAuthorizedSlackRequest } from "./security";

describe("Slack signing secret", () => {
  const runLiveSigningSecretCheck = process.env.RUN_LIVE_SLACK_SIGNING_SECRET_CHECK === "true";

  (runLiveSigningSecretCheck ? it : it.skip)("validates a signed `/ghl` command without calling Slack", () => {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    expect(signingSecret).toBeTruthy();

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const rawBody = "command=%2Fghl&channel_id=C_TEST&channel_name=2609-abc-test-ame";
    const signature = `v0=${crypto
      .createHmac("sha256", signingSecret!)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex")}`;

    expect(isAuthorizedSlackRequest({ signingSecret: signingSecret!, timestamp, signature, rawBody })).toBe(true);
  });
});
