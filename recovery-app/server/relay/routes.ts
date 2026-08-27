import type { Request, Response } from "express";
import { Router } from "express";
import { getRelayConfig } from "./config";
import { createWebhookReceipt, finishWebhookReceipt, logRelayAction } from "./db";
import { makePayloadHash, makeWebhookDeliveryKey } from "./naming";
import { redactErrorDetail, isAuthorizedGhlWebhook } from "./security";
import { dealershipWebhookPayloadSchema, productionWebhookPayloadSchema, relayEventTypes, type RelayEventType } from "./types";
import { handleRelayWorkflow } from "./workflows";
import { runOncePerWebhook, shouldDeduplicateRelayEvent } from "./idempotency";
import {
  handleLegacyCampaignValueSyncWebhook,
  handleLegacyCreateChannelWebhook,
  handleLegacyDealershipSyncWebhook,
  handleLegacyGhlWebhook,
  handleLegacyProofStatusWebhook,
} from "./legacy-ghl-webhook";

const relayRouter = Router();

const isRelayEventType = (value: string): value is RelayEventType =>
  (relayEventTypes as readonly string[]).includes(value);

export const selectLegacyHeaderlessHandler = (
  eventType: string,
  authorized: boolean
): "canvas" | "proof" | "create" | "campaign_values" | "dealership_values" | null => {
  if (authorized) return null;
  if (eventType === "production_update") return "canvas";
  if (eventType === "proof_status") return "proof";
  if (eventType === "create_channel") return "create";
  if (eventType === "push_campaign_values") return "campaign_values";
  if (eventType === "dealership_sync") return "dealership_values";
  return null;
};

relayRouter.post("/ghl/:eventType", async (req: Request, res: Response) => {
  const eventType = req.params.eventType;
  const config = getRelayConfig();
  if (!isRelayEventType(eventType)) {
    res.status(404).json({ error: "Unknown relay workflow" });
    return;
  }
  const authorized = isAuthorizedGhlWebhook(req.header("authorization") ?? undefined, config.ghlWebhookSharedSecret);
  const legacyHandler = selectLegacyHeaderlessHandler(eventType, authorized);
  if (legacyHandler === "canvas") {
    handleLegacyGhlWebhook(req, res);
    return;
  }
  if (legacyHandler === "proof") {
    handleLegacyProofStatusWebhook(req, res);
    return;
  }
  if (legacyHandler === "create") {
    handleLegacyCreateChannelWebhook(req, res);
    return;
  }
  if (legacyHandler === "campaign_values") {
    handleLegacyCampaignValueSyncWebhook(req, res);
    return;
  }
  if (legacyHandler === "dealership_values") {
    handleLegacyDealershipSyncWebhook(req, res);
    return;
  }
  if (!authorized) {
    res.status(401).json({ error: "Unauthorized relay request" });
    return;
  }
  const parsed = (eventType === "dealership_sync" ? dealershipWebhookPayloadSchema : productionWebhookPayloadSchema).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: eventType === "dealership_sync" ? "Webhook payload is missing a Dealership record ID" : "Webhook payload is missing a production name" });
    return;
  }

  const deduplicate = shouldDeduplicateRelayEvent(eventType);
  const deliveryKey = makeWebhookDeliveryKey(eventType, parsed.data);
  try {
    if (!deduplicate) {
      await handleRelayWorkflow(eventType, parsed.data);
      res.status(200).json({ ok: true });
      return;
    }

    const outcome = await runOncePerWebhook(
      () => createWebhookReceipt({ deliveryKey, eventType, payloadHash: makePayloadHash(parsed.data) }),
      () => handleRelayWorkflow(eventType, parsed.data),
      result => finishWebhookReceipt(deliveryKey, result)
    );
    if (outcome === "duplicate") {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    const detail = redactErrorDetail(error);
    if (deduplicate) {
      await finishWebhookReceipt(deliveryKey, "failed").catch(() => undefined);
    }
    await logRelayAction({ action: `webhook_${eventType}`, outcome: "failed", detail }).catch(() => undefined);
    res.status(500).json({ error: "Relay action failed", detail });
  }
});

export { relayRouter };
