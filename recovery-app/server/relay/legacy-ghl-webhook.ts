import type { Request, Response } from "express";
import { createWebhookReceipt, finishWebhookReceipt, logRelayAction } from "./db";
import { fetchProductionRecord } from "./ghl";
import { makePayloadHash, makeWebhookDeliveryKey, normalizeCampaignChannelName } from "./naming";
import { redactErrorDetail } from "./security";
import {
  dealershipWebhookPayloadSchema,
  productionWebhookPayloadSchema,
  type DealershipWebhookPayload,
  type ProductionWebhookPayload,
} from "./types";
import { ensureCampaignChannelAndCanvas, refreshProductionCanvas, sendProofStageNotice, syncCampaignValues, syncDealershipValues } from "./workflows";

/**
 * Parses the exact lightweight payload used by the former Production Update
 * GHL to Slack Custom Webhook. The existing workflow only needs its dead site
 * address replaced; it does not need a new trigger, header, or payload shape.
 */
export const parseLegacyGhlWebhookPayload = (value: unknown): ProductionWebhookPayload | null => {
  const parsed = productionWebhookPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

/** Parses the exact record ID and status sent by the existing VERIFIED workflow. */
export const parseLegacyDealershipWebhookPayload = (value: unknown): DealershipWebhookPayload | null => {
  const parsed = dealershipWebhookPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

/**
 * Legacy compatibility route retained for the existing GHL Custom Webhook.
 *
 * The preserved relay returned `ok` immediately, then retrieved the fresh ADO
 * Production and Dealership data itself before editing the saved Canvas. This
 * route restores that exact delivery contract at the new published address.
 */
export const handleLegacyGhlWebhook = (req: Request, res: Response) => {
  res.status(200).send("ok");

  const payload = parseLegacyGhlWebhookPayload(req.body);
  if (!payload) {
    void logRelayAction({
      action: "legacy_ghl_webhook",
      outcome: "skipped",
      detail: "Legacy Canvas refresh request did not include a Production name.",
    });
    return;
  }

  void refreshProductionCanvas(payload)
    .then(() =>
      logRelayAction({
        action: "legacy_ghl_webhook",
        outcome: "success",
        detail: "Legacy Production Update GHL to Slack webhook refreshed the Production Canvas.",
      })
    )
    .catch(error =>
      logRelayAction({
        action: "legacy_ghl_webhook",
        outcome: "failed",
        detail: redactErrorDetail(error),
      })
    );
};

export type LegacyProofStatusWorkDependencies = {
  createReceipt: typeof createWebhookReceipt;
  finishReceipt: typeof finishWebhookReceipt;
  sendNotice: typeof sendProofStageNotice;
  logAction: typeof logRelayAction;
  resolveDelivery: (payload: ProductionWebhookPayload) => Promise<ResolvedProofDelivery>;
};

type ResolvedProofDelivery = {
  payload: ProductionWebhookPayload;
  recordVersion: string | null;
};

const LEGACY_PROOF_STAGE_REFRESH_DELAYS_MS = [0, 4_000, 10_000, 20_000] as const;

const delay = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

/**
 * A legacy proof webhook contains only the Production name. GoHighLevel may
 * deliver it a few seconds before the changed Proof Stage is readable. Wait a
 * short bounded period, then include the current record version in the receipt
 * key so a real later reprint is not mistaken for an old delivery retry.
 */
export async function resolveLegacyProofDelivery(payload: ProductionWebhookPayload): Promise<ResolvedProofDelivery> {
  const channelName = payload.channel_name || normalizeCampaignChannelName(payload.production_name);
  let lastRecord: Awaited<ReturnType<typeof fetchProductionRecord>> | null = null;
  for (const waitMs of LEGACY_PROOF_STAGE_REFRESH_DELAYS_MS) {
    if (waitMs > 0) await delay(waitMs);
    const record = await fetchProductionRecord(channelName);
    lastRecord = record;
    const proofStage = payload.proof_stage?.trim() || record?.properties.proof_stage?.trim();
    if (proofStage) {
      const recordVersion = String((record as { updatedAt?: unknown } | null)?.updatedAt ?? "").trim() || null;
      return { payload: { ...payload, proof_stage: proofStage }, recordVersion };
    }
  }
  const recordVersion = String((lastRecord as { updatedAt?: unknown } | null)?.updatedAt ?? "").trim() || null;
  return { payload, recordVersion };
}

const legacyProofStatusWorkDependencies: LegacyProofStatusWorkDependencies = {
  createReceipt: createWebhookReceipt,
  finishReceipt: finishWebhookReceipt,
  sendNotice: sendProofStageNotice,
  logAction: logRelayAction,
  resolveDelivery: resolveLegacyProofDelivery,
};

/**
 * The preserved proof notice and BDC image work continue after GoHighLevel
 * receives its immediate acknowledgement. A receipt blocks a delivery retry
 * from posting another Sent to Print message while that original work runs.
 */
export async function processLegacyProofStatusWebhook(
  payload: ProductionWebhookPayload,
  dependencies: LegacyProofStatusWorkDependencies = legacyProofStatusWorkDependencies
): Promise<"processed" | "duplicate"> {
  const resolved = await dependencies.resolveDelivery(payload);
  const receiptPayload = { ...resolved.payload, proof_record_version: resolved.recordVersion ?? "" };
  const deliveryKey = makeWebhookDeliveryKey("proof_status", receiptPayload);
  const receipt = await dependencies.createReceipt({
    deliveryKey,
    eventType: "proof_status",
    payloadHash: makePayloadHash(receiptPayload),
  });
  if (!receipt.accepted) return "duplicate";

  try {
    await dependencies.sendNotice(resolved.payload);
    await dependencies.finishReceipt(deliveryKey, "processed");
    return "processed";
  } catch (error) {
    await dependencies.finishReceipt(deliveryKey, "failed").catch(() => undefined);
    await dependencies.logAction({
      action: "legacy_proof_status_webhook",
      outcome: "failed",
      detail: redactErrorDetail(error),
    }).catch(() => undefined);
    throw error;
  }
}

/**
 * The legacy GoHighLevel proof webhook must return immediately. Sent-to-Print
 * BDC processing continues in the existing duplicate-safe worker after that
 * acknowledgement, just like the other legacy relay handlers.
 */
export const handleLegacyProofStatusWebhook = (
  req: Request,
  res: Response,
  dependencies: LegacyProofStatusWorkDependencies = legacyProofStatusWorkDependencies
) => {
  const payload = parseLegacyGhlWebhookPayload(req.body);
  if (!payload) {
    res.status(200).send("ok");
    void logRelayAction({
      action: "legacy_proof_status_webhook",
      outcome: "skipped",
      detail: "Legacy proof-stage request did not include a Production name.",
    });
    return;
  }

  res.status(200).send("ok");
  void processLegacyProofStatusWebhook(payload, dependencies).catch(() => undefined);
};

/**
 * The original Create Slack Channel workflow used the same no-header,
 * immediate-acknowledgment contract. Its background task creates or reuses the
 * campaign channel, refreshes the Production Canvas, and schedules the
 * channel archive from the current Event End date.
 */
export const handleLegacyCreateChannelWebhook = (req: Request, res: Response) => {
  res.status(200).send("ok");

  const payload = parseLegacyGhlWebhookPayload(req.body);
  if (!payload) {
    void logRelayAction({
      action: "legacy_create_channel_webhook",
      outcome: "skipped",
      detail: "Legacy Create Slack Channel request did not include a Production name.",
    });
    return;
  }

  void ensureCampaignChannelAndCanvas(payload)
    .then(() =>
      logRelayAction({
        action: "legacy_create_channel_webhook",
        outcome: "success",
        detail: "Legacy Create Slack Channel webhook completed campaign setup and archive scheduling.",
      })
    )
    .catch(error =>
      logRelayAction({
        action: "legacy_create_channel_webhook",
        outcome: "failed",
        detail: redactErrorDetail(error),
      })
    );
};

/**
 * The existing Post Production campaign-value workflow also used a simple
 * headerless immediate acknowledgment. It sends only a Production name; the
 * relay reads the current ADO Production and Dealership records and updates
 * the approved custom values in the linked dealership subaccount.
 */
export const handleLegacyCampaignValueSyncWebhook = (req: Request, res: Response) => {
  res.status(200).send("ok");

  const payload = parseLegacyGhlWebhookPayload(req.body);
  if (!payload) {
    void logRelayAction({
      action: "legacy_campaign_value_sync_webhook",
      outcome: "skipped",
      detail: "Legacy campaign-value request did not include a Production name.",
    });
    return;
  }

  void syncCampaignValues(payload).catch(error =>
    logRelayAction({
      action: "legacy_campaign_value_sync_webhook",
      outcome: "failed",
      detail: redactErrorDetail(error),
    })
  );
};

/**
 * The existing Dealership Object to Subaccount Custom Values workflow sends
 * `record_id` and `verified`. It receives an immediate acknowledgment, then
 * the relay retrieves and updates only that exact linked dealership subaccount.
 */
export const handleLegacyDealershipSyncWebhook = (req: Request, res: Response) => {
  res.status(200).send("ok");

  const payload = parseLegacyDealershipWebhookPayload(req.body);
  if (!payload || payload.verified?.trim().toLowerCase() !== "verified") {
    void logRelayAction({
      action: "legacy_dealership_sync_webhook",
      outcome: "skipped",
      detail: "Legacy dealership-sync request is missing a verified Dealership record ID.",
    });
    return;
  }

  void syncDealershipValues(payload).catch(error =>
    logRelayAction({
      action: "legacy_dealership_sync_webhook",
      outcome: "failed",
      detail: redactErrorDetail(error),
    })
  );
};
