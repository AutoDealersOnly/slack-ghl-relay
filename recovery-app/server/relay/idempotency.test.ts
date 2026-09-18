import { describe, expect, it, vi } from "vitest";
import { preserveCampaignContext } from "./db";
import { runOncePerWebhook, shouldDeduplicateRelayEvent } from "./idempotency";

describe("webhook idempotency", () => {
  it("does not process a receipt that was already claimed", async () => {
    const process = vi.fn();
    const finish = vi.fn();
    await expect(runOncePerWebhook(async () => ({ accepted: false }), process, finish)).resolves.toBe("duplicate");
    expect(process).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });

  it("marks a newly claimed receipt as processed", async () => {
    const process = vi.fn();
    const finish = vi.fn();
    await expect(runOncePerWebhook(async () => ({ accepted: true }), process, finish)).resolves.toBe("processed");
    expect(process).toHaveBeenCalledOnce();
    expect(finish).toHaveBeenCalledWith("processed");
  });

  it("allows every Production update delivery through while retaining protection for proof messages", () => {
    expect(shouldDeduplicateRelayEvent("production_update")).toBe(false);
    expect(shouldDeduplicateRelayEvent("proof_status")).toBe(true);
  });
});

describe("campaign context preservation", () => {
  it("retains saved Activity Dashboard dates and dealership data when a later GHL refresh omits them", () => {
    const preserved = preserveCampaignContext(
      { productionName: "ABC Test", channelName: "2609-abc-test-ame", eventStartDate: null, eventEndDate: "2026-09-13", dealershipLocationId: null },
      { eventStartDate: "2026-09-04", eventEndDate: "2026-09-12", dealershipLocationId: "saved-location", dealershipRecordId: "saved-dealer", channelId: "saved-channel", canvasId: "saved-canvas" }
    );
    expect(preserved).toMatchObject({
      eventStartDate: "2026-09-04",
      eventEndDate: "2026-09-13",
      dealershipLocationId: "saved-location",
      dealershipRecordId: "saved-dealer",
      channelId: "saved-channel",
      canvasId: "saved-canvas",
    });
  });

  it("uses meaningful updated GHL values when they are available", () => {
    const preserved = preserveCampaignContext(
      { productionName: "ABC Test", channelName: "2609-abc-test-ame", eventStartDate: "2026-09-04", dealershipLocationId: "new-location" },
      { eventStartDate: "2026-09-01", dealershipLocationId: "saved-location" }
    );
    expect(preserved).toMatchObject({ eventStartDate: "2026-09-04", dealershipLocationId: "new-location" });
  });
});
