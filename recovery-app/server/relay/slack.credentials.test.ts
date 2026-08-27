import { describe, expect, it } from "vitest";

describe("Slack bot connection", () => {
  const runLiveCredentialCheck = process.env.RUN_LIVE_SLACK_CREDENTIAL_CHECK === "true";

  (runLiveCredentialCheck ? it : it.skip)("can authenticate the configured bot without changing Slack data", async () => {
    const token = process.env.SLACK_BOT_TOKEN;
    expect(token).toBeTruthy();

    const response = await fetch("https://slack.com/api/auth.test", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok?: boolean; bot_id?: string; team_id?: string };
    expect(body.ok).toBe(true);
    expect(body.bot_id).toBeTruthy();
    expect(body.team_id).toBeTruthy();
  }, 15_000);
});
