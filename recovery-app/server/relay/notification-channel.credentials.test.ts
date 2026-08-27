import { describe, expect, it } from "vitest";

const runLive = process.env.RUN_LIVE_SLACK_NOTIFICATION_DIAGNOSTIC === "true";

describe.skipIf(!runLive)("GHL New Subaccounts notification channel", () => {
  it("is readable by the existing Slack bot without posting a message", async () => {
    const channel = process.env.SLACK_NOTIFICATION_CHANNEL_ID?.trim();
    const token = process.env.SLACK_BOT_TOKEN?.trim();
    expect(channel).toBeTruthy();
    expect(token).toBeTruthy();

    const response = await fetch(`https://slack.com/api/conversations.info?channel=${encodeURIComponent(channel ?? "")}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    expect(data.ok, data.error ?? "Slack did not accept the protected notification channel setting").toBe(true);
  });
});
