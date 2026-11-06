import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  handleLegacyProofStatusWebhook,
  parseLegacyGhlWebhookPayload,
  processLegacyProofStatusWebhook,
  type LegacyProofStatusWorkDependencies,
} from "./legacy-ghl-webhook";
import { selectLegacyHeaderlessHandler } from "./routes";

const proofPayload = { production_name: "2609 ABC Test AME", proof_stage: "sent_to_print" };

const proofDependencies = (overrides: Partial<LegacyProofStatusWorkDependencies> = {}): LegacyProofStatusWorkDependencies => ({
  createReceipt: vi.fn(async () => ({ accepted: true })),
  finishReceipt: vi.fn(async () => undefined),
  sendNotice: vi.fn(async () => undefined),
  logAction: vi.fn(async () => undefined),
  resolveDelivery: vi.fn(async payload => ({ payload, recordVersion: "first-save" })),
  ...overrides,
});

describe("legacy GHL Canvas-refresh webhook payload", () => {
  it("accepts the original lightweight Production-name payload", () => {
    expect(parseLegacyGhlWebhookPayload({ production_name: "2609 ABC Test AME" })).toEqual({
      production_name: "2609 ABC Test AME",
    });
  });

  it("retains an existing optional channel name without requiring a new field", () => {
    expect(
      parseLegacyGhlWebhookPayload({
        production_name: "2609 ABC Test AME",
        channel_name: "2609-abc-test-ame",
      })
    ).toEqual({
      production_name: "2609 ABC Test AME",
      channel_name: "2609-abc-test-ame",
    });
  });

  it("safely ignores an incomplete legacy delivery", () => {
    expect(parseLegacyGhlWebhookPayload({ channel_name: "2609-abc-test-ame" })).toBeNull();
  });

  it("directs unprotected Canvas, proof, channel-creation, and campaign-value deliveries to their separate legacy handlers", () => {
    expect(selectLegacyHeaderlessHandler("production_update", false)).toBe("canvas");
    expect(selectLegacyHeaderlessHandler("proof_status", false)).toBe("proof");
    expect(selectLegacyHeaderlessHandler("create_channel", false)).toBe("create");
    expect(selectLegacyHeaderlessHandler("push_campaign_values", false)).toBe("campaign_values");
    expect(selectLegacyHeaderlessHandler("production_update", true)).toBeNull();
    expect(selectLegacyHeaderlessHandler("proof_status", true)).toBeNull();
    expect(selectLegacyHeaderlessHandler("create_channel", true)).toBeNull();
    expect(selectLegacyHeaderlessHandler("push_campaign_values", true)).toBeNull();
  });

  it("keeps Sent to Print attached to its request until the notice and image work finish", async () => {
    let releaseReceipt: ((value: { accepted: boolean }) => void) | undefined;
    let releaseNotice: (() => void) | undefined;
    const dependencies = proofDependencies({
      createReceipt: vi.fn(() => new Promise(resolve => { releaseReceipt = resolve; })),
      sendNotice: vi.fn(() => new Promise<void>(resolve => { releaseNotice = resolve; })),
    });
    const response = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as unknown as Response;

    const work = handleLegacyProofStatusWebhook({ body: proofPayload } as Request, response, dependencies);

    expect(response.send).not.toHaveBeenCalled();
    expect(dependencies.sendNotice).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(dependencies.createReceipt).toHaveBeenCalledOnce());
    releaseReceipt?.({ accepted: true });
    await vi.waitFor(() => expect(dependencies.sendNotice).toHaveBeenCalledWith(proofPayload));
    expect(response.send).not.toHaveBeenCalled();
    releaseNotice?.();
    await work;
    expect(dependencies.finishReceipt).toHaveBeenCalledWith(expect.any(String), "processed");
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith("ok");
  });

  it("also awaits name-only requests whose fresh record supplies Sent to Print", async () => {
    let release: (() => void) | undefined;
    const dependencies = proofDependencies({
      resolveDelivery: vi.fn(async payload => ({ payload: { ...payload, proof_stage: "sent_to_print" }, recordVersion: "saved" })),
      sendNotice: vi.fn(() => new Promise<void>(resolve => { release = resolve; })),
    });
    const response = { status: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as Response;
    const work = handleLegacyProofStatusWebhook({ body: { production_name: proofPayload.production_name } } as Request, response, dependencies);
    await vi.waitFor(() => expect(dependencies.sendNotice).toHaveBeenCalledOnce());
    expect(response.send).not.toHaveBeenCalled();
    release?.();
    await work;
    expect(response.send).toHaveBeenCalledWith("ok");
  });

  it("retains immediate acknowledgement for explicitly supplied non-print proof stages", async () => {
    let release: (() => void) | undefined;
    const dependencies = proofDependencies({ sendNotice: vi.fn(() => new Promise<void>(resolve => { release = resolve; })) });
    const response = { status: vi.fn().mockReturnThis(), send: vi.fn() } as unknown as Response;
    await handleLegacyProofStatusWebhook({ body: { ...proofPayload, proof_stage: "Request Proof" } } as Request, response, dependencies);
    expect(response.send).toHaveBeenCalledWith("ok");
    await vi.waitFor(() => expect(dependencies.sendNotice).toHaveBeenCalledOnce());
    release?.();
    await vi.waitFor(() => expect(dependencies.finishReceipt).toHaveBeenCalledOnce());
  });

  it("does not repeat the Sent to Print notice or image work for a duplicate delivery", async () => {
    const dependencies = proofDependencies({
      createReceipt: vi.fn(async () => ({ accepted: false })),
    });

    await expect(processLegacyProofStatusWebhook(proofPayload, dependencies)).resolves.toBe("duplicate");
    expect(dependencies.sendNotice).not.toHaveBeenCalled();
    expect(dependencies.finishReceipt).not.toHaveBeenCalled();
  });

  it("uses the freshly resolved stage and record version so a real reprint is not treated as an old retry", async () => {
    const first = proofDependencies({
      resolveDelivery: vi.fn(async payload => ({ payload: { ...payload, proof_stage: "sent_to_print" }, recordVersion: "first-save" })),
    });
    const second = proofDependencies({
      resolveDelivery: vi.fn(async payload => ({ payload: { ...payload, proof_stage: "sent_to_print" }, recordVersion: "later-reprint-save" })),
    });

    await processLegacyProofStatusWebhook({ production_name: "2609 ABC Test AME" }, first);
    await processLegacyProofStatusWebhook({ production_name: "2609 ABC Test AME" }, second);

    expect(first.sendNotice).toHaveBeenCalledWith({ production_name: "2609 ABC Test AME", proof_stage: "sent_to_print" });
    expect(second.sendNotice).toHaveBeenCalledWith({ production_name: "2609 ABC Test AME", proof_stage: "sent_to_print" });
    const firstKey = (first.createReceipt as ReturnType<typeof vi.fn>).mock.calls[0][0].deliveryKey;
    const secondKey = (second.createReceipt as ReturnType<typeof vi.fn>).mock.calls[0][0].deliveryKey;
    expect(firstKey).not.toBe(secondKey);
  });
});
