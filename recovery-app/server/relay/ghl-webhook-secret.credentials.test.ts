import { describe, expect, it } from "vitest";

describe("GHL webhook shared secret", () => {
  const runLiveWebhookCheck = process.env.RUN_LIVE_GHL_WEBHOOK_SECRET_CHECK === "true";

  (runLiveWebhookCheck ? it : it.skip)("authorizes an inert unknown relay event without running a workflow", async () => {
    const secret = process.env.GHL_WEBHOOK_SHARED_SECRET;
    expect(secret).toBeTruthy();

    const response = await fetch("http://localhost:3000/api/relay/ghl/authorization-check-only", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ production_name: "authorization-check-only" }),
    });

    // A 404 proves authentication passed and the route stopped before a workflow could run.
    expect(response.status).toBe(404);
  }, 15_000);
});
