import { describe, expect, it } from "vitest";

describe("ADO GoHighLevel connection", () => {
  const runLiveCredentialCheck = process.env.RUN_LIVE_GHL_CREDENTIAL_CHECK === "true";

  (runLiveCredentialCheck ? it : it.skip)("can read the configured ADO location without exposing credentials", async () => {
    const apiKey = process.env.GHL_API_KEY;
    const locationId = process.env.GHL_LOCATION_ID;
    expect(apiKey).toBeTruthy();
    expect(locationId).toBeTruthy();

    const response = await fetch(
      `https://services.leadconnectorhq.com/locations/${encodeURIComponent(locationId!)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: "2021-07-28",
        },
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { location?: { id?: string } };
    expect(body.location?.id).toBe(locationId);
  }, 15_000);
});
