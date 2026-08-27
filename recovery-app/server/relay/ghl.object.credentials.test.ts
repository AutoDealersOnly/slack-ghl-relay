import { describe, expect, it } from "vitest";
import { normalizeGhlPrivateIntegrationToken } from "./config";

const runLiveObjectDiagnostic = process.env.RUN_LIVE_GHL_OBJECT_DIAGNOSTIC === "true";

type SafeErrorResponse = {
  message?: string;
  error?: string;
  statusCode?: number;
};

describe.skipIf(!runLiveObjectDiagnostic)("ADO Production object request", () => {
  it("can make a read-only empty-result request without creating any campaign or Canvas", async () => {
    const apiKey = normalizeGhlPrivateIntegrationToken(process.env.GHL_API_KEY ?? "");
    const locationId = process.env.GHL_LOCATION_ID;
    expect(apiKey).toBeTruthy();
    expect(locationId).toBeTruthy();

    const response = await fetch(
      "https://services.leadconnectorhq.com/objects/custom_objects.production/records/search",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: "2021-07-28",
          LocationId: locationId!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locationId,
          page: 1,
          pageLimit: 1,
          query: "__relay_read_only_diagnostic_no_match__",
        }),
      }
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as SafeErrorResponse;
      const category = body.error ?? body.message ?? "no safe error message returned";
      throw new Error(`GHL object diagnostic returned ${response.status}: ${category}`);
    }

    expect(response.ok).toBe(true);
  }, 15_000);
});
