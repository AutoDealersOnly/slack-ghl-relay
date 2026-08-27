import type { Request, Response } from "express";
import { logRelayAction } from "./db";
import { redactErrorDetail } from "./security";
import { productionWebhookPayloadSchema, type ProductionWebhookPayload } from "./types";
import { ensureCampaignChannelAndCanvas, refreshProductionCanvas, sendProofStageNotice } from "./workflows";

/**
 * Parses the exact lightweight payload used by the former Production Update
 * GHL to Slack Custom Webhook. The existing workflow only needs its dead site
 * address replaced; it does not need a new trigger, header, or payload shape.
 */
export const parseLegacyGhlWebhookPayload = (value: unknown): ProductionWebhookPayload | null => {
  const parsed = productionWebhookPayloadSchema.safeParse(value);
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

/**
 * The existing proof-stage workflow used the same immediate-acknowledgment
 * pattern as the Canvas workflow, but its background task must post the
 * stage-specific Slack notice rather than refresh the Production Canvas.
 */
export const handleLegacyProofStatusWebhook = (req: Request, res: Response) => {
  res.status(200).send("ok");

  const payload = parseLegacyGhlWebhookPayload(req.body);
  if (!payload) {
    void logRelayAction({
      action: "legacy_proof_status_webhook",
      outcome: "skipped",
      detail: "Legacy proof-stage request did not include a Production name.",
    });
    return;
  }

  void sendProofStageNotice(payload).catch(error =>
    logRelayAction({
      action: "legacy_proof_status_webhook",
      outcome: "failed",
      detail: redactErrorDetail(error),
    })
  );
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
