import { describe, expect, it, vi } from "vitest";
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
