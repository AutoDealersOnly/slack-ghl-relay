import type { Request, Response } from "express";
import { Router } from "express";
import { getRelayConfig } from "./config";
import { createWebhookReceipt, finishWebhookReceipt, logRelayAction } from "./db";
import { makePayloadHash, makeWebhookDeliveryKey } from "./naming";
import { redactErrorDetail, isAuthorizedGhlWebhook } from "./security";
import { productionWebhookPayloadSchema, relayEventTypes, type RelayEventType } from "./types";
import { handleRelayWorkflow } from "./workflows";
import { runOncePerWebhook } from "./idempotency";

const relayRouter = Router();

const isRelayEventType = (value: string): value is RelayEventType =>
  (relayEventTypes as readonly string[]).includes(value);

relayRouter.post("/ghl/:eventType", async (req: Request, res: Response) => {
  const eventType = req.params.eventType;
  const config = getRelayConfig();
  if (!isAuthorizedGhlWebhook(req.header("authorization") ?? undefined, config.ghlWebhookSharedSecret)) {
    res.status(401).json({ error: "Unauthorized relay request" });
    return;
  }
  if (!isRelayEventType(eventType)) {
    res.status(404).json({ error: "Unknown relay workflow" });
    return;
  }
  const parsed = productionWebhookPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Webhook payload is missing a production name" });
    return;
  }

  const deliveryKey = makeWebhookDeliveryKey(eventType, parsed.data);
  try {
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
    await finishWebhookReceipt(deliveryKey, "failed").catch(() => undefined);
    await logRelayAction({ action: `webhook_${eventType}`, outcome: "failed", detail }).catch(() => undefined);
    res.status(500).json({ error: "Relay action failed", detail });
  }
});

export { relayRouter };
