import type { Request, Response } from "express";
import { Router } from "express";
import { buildProductionCanvas } from "./canvas";
import { getRelayConfig } from "./config";
import { getCampaignByChannelName, logRelayAction, upsertCampaign } from "./db";
import { fetchDealership, fetchProductionRecord } from "./ghl";
import { normalizeCampaignChannelName } from "./naming";
import { scheduleCampaignArchive } from "./scheduling";
import { createOrUpdateProductionCanvas } from "./slack";
import { isAuthorizedSlackRequest, redactErrorDetail } from "./security";

type SlackCommandRequest = Request & { rawBody?: string };
type SlackCommandBody = { channel_id?: string; channel_name?: string; user_id?: string };

const slackCommandRouter = Router();

slackCommandRouter.post("/ghl", async (req: SlackCommandRequest, res: Response) => {
  const config = getRelayConfig();
  const authorized = isAuthorizedSlackRequest({
    signingSecret: config.slackSigningSecret,
    timestamp: req.header("x-slack-request-timestamp") ?? undefined,
    signature: req.header("x-slack-signature") ?? undefined,
    rawBody: req.rawBody,
  });
  if (!authorized) {
    res.status(401).send("Unauthorized Slack command");
    return;
  }

  const body = req.body as SlackCommandBody;
  const channelId = body.channel_id?.trim();
  const channelName = body.channel_name ? normalizeCampaignChannelName(body.channel_name) : "";
  if (!channelId || !channelName) {
    res.json({ response_type: "ephemeral", text: "This command needs a Slack channel name and ID." });
    return;
  }

  // Slack requires a response within a few seconds. Acknowledge before the
  // production/dealership lookups and Canvas refresh so the command never
  // shows the former "app did not respond" timeout.
  res.json({ response_type: "ephemeral", text: `Linking #${channelName} to its ADO Production record…` });

  void (async () => {
    try {
    const production = await fetchProductionRecord(channelName);
    if (!production) {
      await logRelayAction({ action: "slack_ghl_channel_link", outcome: "failed", detail: `No ADO Production record was found for #${channelName}.` });
      return;
    }
    const dealershipRelation = production.relations?.find(relation => relation.objectKey === "custom_objects.dealerships");
    const dealership = dealershipRelation ? await fetchDealership(dealershipRelation.recordId) : null;
    const existing = await getCampaignByChannelName(channelName);
    const canvasId = await createOrUpdateProductionCanvas(
      channelId,
      buildProductionCanvas(production.properties, dealership?.properties ?? {}),
      existing?.canvasId
    );
    const campaign = await upsertCampaign({
      productionName: production.properties.production ?? channelName,
      channelName,
      channelId,
      canvasId,
      dealershipRecordId: dealership?.id ?? null,
      dealershipName: dealership?.properties.dealership_name ?? null,
      eventEndDate: production.properties.event_end ?? null,
    });
    if (campaign.eventEndDate && campaign.archiveStatus !== "scheduled") {
      await scheduleCampaignArchive(channelName);
    }
    await logRelayAction({ campaignId: campaign.id, action: "slack_ghl_channel_link", outcome: "success", detail: "Slack /ghl linked the existing channel and refreshed its Production Canvas." });
    } catch (error) {
    const detail = redactErrorDetail(error);
    await logRelayAction({ action: "slack_ghl_channel_link", outcome: "failed", detail }).catch(() => undefined);
    }
  })();
});

export { slackCommandRouter };
