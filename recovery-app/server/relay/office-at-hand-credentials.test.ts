import { describe, expect, it } from "vitest";

const runLiveDiagnostic = process.env.RUN_LIVE_OFFICE_AT_HAND_CREDENTIAL_DIAGNOSTIC === "true";

describe.runIf(runLiveDiagnostic)("OfficeAtHand private test-app credentials", () => {
  it("accepts the app credentials before any user authorization or call subscription is attempted", async () => {
    const clientId = process.env.OFFICE_AT_HAND_CLIENT_ID?.trim() ?? "";
    const clientSecret = process.env.OFFICE_AT_HAND_CLIENT_SECRET?.trim() ?? "";
    expect(clientId).not.toBe("");
    expect(clientSecret).not.toBe("");

    // The deliberately unusable authorization code proves only that the
    // provider recognizes the private app credentials. This endpoint cannot
    // subscribe to, view, route, record, or otherwise change a phone call.
    const response = await fetch("https://platform.ringcentral.com/restapi/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "credential-verification-only",
        redirect_uri: "https://ghl-slackrel-knvzqxuh.manus.space/api/office-at-hand/oauth/callback",
      }).toString(),
    });

    const body = (await response.json().catch(() => ({}))) as { error?: unknown };
    expect(response.status).not.toBe(401);
    expect(body.error).not.toBe("invalid_client");
  }, 15_000);
});
