import type { Request, Response } from "express";
import { Router } from "express";
import { getRelayConfig } from "./config";
import { findOpenActivityDashboardCampaignByLocation, logRelayAction } from "./db";
import { recordCampaignActivity } from "./activity-dashboard";
import { isAuthorizedGhlWebhook, redactErrorDetail } from "./security";
import { activityDashboardWebhookPayloadSchema } from "./types";

const activityDashboardRouter = Router();

/**
 * Receives only a small, authenticated source event from a published GHL
 * workflow. Contact IDs are immediately transformed to one-way fingerprints;
 * no customer data is returned, logged, or sent to Slack.
 */
activityDashboardRouter.post("/event", async (req: Request, res: Response) => {
  const config = getRelayConfig();
  if (!isAuthorizedGhlWebhook(req.header("authorization") ?? undefined, config.ghlWebhookSharedSecret)) {
    res.status(401).json({ error: "Unauthorized activity notice" });
    return;
  }
  const parsed = activityDashboardWebhookPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Activity notice is missing its source, contact, or dealership context" });
    return;
  }

  try {
    const campaign = await findOpenActivityDashboardCampaignByLocation(parsed.data.location_id);
    if (!campaign) {
      res.status(200).json({ ok: true, skipped: "no_single_open_activity_dashboard" });
      return;
    }
    const stableReference = parsed.data.appointment_id || `${parsed.data.source}:${parsed.data.contact_id}`;
    const outcome = await recordCampaignActivity({
      campaign,
      source: parsed.data.source,
      contactId: parsed.data.contact_id,
      stableReference,
      secret: config.ghlWebhookSharedSecret,
    });
    res.status(200).json({ ok: true, outcome });
  } catch (error) {
    const detail = redactErrorDetail(error);
    await logRelayAction({ action: "activity_dashboard_event", outcome: "failed", detail }).catch(() => undefined);
    res.status(500).json({ error: "Activity notice could not be recorded", detail });
  }
});

export { activityDashboardRouter };
