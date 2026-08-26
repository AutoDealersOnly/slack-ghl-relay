import { buildProductionCanvas } from "./canvas";
import { getRelayConfig } from "./config";
import {
  campaignCustomValues,
  dealershipCustomValues,
  fetchDealership,
  fetchProductionRecord,
  syncCustomValues,
} from "./ghl";
import { normalizeCampaignChannelName } from "./naming";
import { getCampaignByChannelName, logRelayAction, upsertCampaign } from "./db";
import { cancelCampaignArchive, rescheduleCampaignArchive, scheduleCampaignArchive } from "./scheduling";
import {
  archiveSlackChannel,
  createOrUpdateProductionCanvas,
  ensureCampaignChannel,
  joinAndInviteCampaignChannel,
  postSlackMessage,
} from "./slack";
import type { ProductionWebhookPayload, RelayEventType } from "./types";

type ProductionContext = {
  channelName: string;
  production: NonNullable<Awaited<ReturnType<typeof fetchProductionRecord>>>;
  dealership: NonNullable<Awaited<ReturnType<typeof fetchDealership>>> | null;
};

async function loadProductionContext(payload: ProductionWebhookPayload): Promise<ProductionContext> {
  const channelName = payload.channel_name || normalizeCampaignChannelName(payload.production_name);
  const production = await fetchProductionRecord(channelName);
  if (!production) throw new Error("No ADO Production record matched this campaign");
  const dealershipRelation = production.relations?.find(relation => relation.objectKey === "custom_objects.dealerships");
  const dealership = dealershipRelation ? await fetchDealership(dealershipRelation.recordId) : null;
  return { channelName, production, dealership };
}

async function postOptionalNotification(text: string): Promise<void> {
  const channelId = getRelayConfig().slackNotificationChannelId;
  if (!channelId) return;
  await postSlackMessage(channelId, text);
}

export async function ensureCampaignChannelAndCanvas(payload: ProductionWebhookPayload) {
  const context = await loadProductionContext(payload);
  const existing = await getCampaignByChannelName(context.channelName);
  const channel = existing?.channelId
    ? { id: existing.channelId, created: false }
    : await ensureCampaignChannel(context.channelName);

  await joinAndInviteCampaignChannel(channel.id);
  const dealership = context.dealership?.properties ?? {};
  const markdown = buildProductionCanvas(context.production.properties, dealership);
  const canvasId = await createOrUpdateProductionCanvas(channel.id, markdown, existing?.canvasId);
  const campaign = await upsertCampaign({
    productionName: context.production.properties.production ?? payload.production_name,
    channelName: context.channelName,
    channelId: channel.id,
    canvasId,
    dealershipRecordId: context.dealership?.id ?? null,
    dealershipName: dealership.dealership_name ?? null,
    eventEndDate: context.production.properties.event_end ?? null,
  });

  if (campaign.archiveStatus === "not_scheduled" && campaign.eventEndDate) {
    await scheduleCampaignArchive(campaign.channelName);
  }
  if (channel.created) {
    await postSlackMessage(channel.id, `Channel created for *${campaign.productionName}*. The Production Canvas is ready.`);
  }
  await logRelayAction({ campaignId: campaign.id, action: "campaign_channel_canvas", outcome: "success", detail: "Campaign channel and Production Canvas are current." });
  return campaign;
}

export async function refreshProductionCanvas(payload: ProductionWebhookPayload) {
  const context = await loadProductionContext(payload);
  const campaign = await getCampaignByChannelName(context.channelName);
  if (!campaign?.channelId) {
    return ensureCampaignChannelAndCanvas(payload);
  }
  const markdown = buildProductionCanvas(context.production.properties, context.dealership?.properties ?? {});
  const canvasId = await createOrUpdateProductionCanvas(campaign.channelId, markdown, campaign.canvasId);
  const updated = await upsertCampaign({
    productionName: context.production.properties.production ?? payload.production_name,
    channelName: context.channelName,
    channelId: campaign.channelId,
    canvasId,
    dealershipRecordId: context.dealership?.id ?? null,
    dealershipName: context.dealership?.properties.dealership_name ?? null,
    eventEndDate: context.production.properties.event_end ?? null,
  });
  await logRelayAction({ campaignId: updated.id, action: "production_canvas_refresh", outcome: "success", detail: "Production Canvas updated in place." });
  return updated;
}

const proofMessage = (proofStage: string, productionName: string): string | null => {
  const stage = proofStage.trim().toLowerCase().replace(/\s+/g, "_");
  const labels: Record<string, string> = {
    request_proof: "Proof request received",
    proofing_needed: "Proofing is needed",
    approved_to_upload: "Approved to upload",
    sent_to_print: "Sent to print",
  };
  const label = labels[stage];
  return label ? `*${label}* — ${productionName}` : null;
};

export async function sendProofStageNotice(payload: ProductionWebhookPayload) {
  const context = await loadProductionContext(payload);
  const campaign = await getCampaignByChannelName(context.channelName);
  const message = proofMessage(payload.proof_stage ?? context.production.properties.proof_stage ?? "", context.production.properties.production ?? payload.production_name);
  if (!campaign?.channelId || !message) {
    await logRelayAction({
      campaignId: campaign?.id ?? null,
      action: "proof_stage_notice",
      outcome: "skipped",
      detail: campaign?.channelId ? "Proof stage does not have a mapped notice." : "Campaign channel does not exist yet.",
    });
    return;
  }
  const mentions = getRelayConfig().slackProofStageMentions.join(" ");
  const routedMessage = mentions ? `${message}\n${mentions}` : message;
  await postSlackMessage(campaign.channelId, routedMessage);
  const notificationChannel = getRelayConfig().slackNotificationChannelId;
  if (notificationChannel && notificationChannel !== campaign.channelId) {
    await postSlackMessage(notificationChannel, routedMessage);
  }
  await logRelayAction({ campaignId: campaign.id, action: "proof_stage_notice", outcome: "success", detail: "Proof-stage notice posted to the campaign channel." });
}

async function resolveDealershipForSync(payload: ProductionWebhookPayload) {
  const context = await loadProductionContext(payload);
  if (!context.dealership?.properties) throw new Error("Production record has no related Dealership record");
  const dealership = context.dealership.properties;
  const locationId = dealership.loc_id?.trim();
  const apiKey = dealership.api_key?.trim();
  if (!locationId || !apiKey) throw new Error("Related Dealership record does not have the required location ID and API key");
  return { context, dealership, locationId, apiKey };
}

export async function syncDealershipValues(payload: ProductionWebhookPayload) {
  const { context, dealership, locationId, apiKey } = await resolveDealershipForSync(payload);
  const result = await syncCustomValues(locationId, apiKey, dealershipCustomValues(dealership));
  await postOptionalNotification(`Dealership values synced for *${dealership.dealership_name ?? context.channelName}*: ${result.updated} updated, ${result.skipped} skipped.`);
  await logRelayAction({ action: "dealership_value_sync", outcome: "success", detail: `${result.updated} values updated; ${result.skipped} skipped.` });
}

export async function syncCampaignValues(payload: ProductionWebhookPayload) {
  const { context, dealership, locationId, apiKey } = await resolveDealershipForSync(payload);
  const result = await syncCustomValues(locationId, apiKey, campaignCustomValues(context.production.properties));
  await postOptionalNotification(`Campaign values synced for *${dealership.dealership_name ?? context.channelName}*: ${result.updated} updated, ${result.skipped} skipped.`);
  await logRelayAction({ action: "campaign_value_sync", outcome: "success", detail: `${result.updated} values updated; ${result.skipped} skipped.` });
}

export async function handleRelayWorkflow(eventType: RelayEventType, payload: ProductionWebhookPayload): Promise<void> {
  switch (eventType) {
    case "create_channel":
      await ensureCampaignChannelAndCanvas(payload);
      return;
    case "production_update":
      await refreshProductionCanvas(payload);
      return;
    case "proof_status":
      await sendProofStageNotice(payload);
      return;
    case "dealership_sync":
      await syncDealershipValues(payload);
      return;
    case "push_campaign_values":
      await syncCampaignValues(payload);
      return;
    case "cancel_archive":
      await cancelCampaignArchive(payload.channel_name || normalizeCampaignChannelName(payload.production_name));
      return;
    case "reschedule_archive":
      await rescheduleCampaignArchive(payload.channel_name || normalizeCampaignChannelName(payload.production_name));
      return;
  }
}

export async function archiveCampaignChannel(campaign: { id: number; channelId: string | null; channelName: string }) {
  if (!campaign.channelId) throw new Error("Campaign does not have a linked Slack channel");
  await archiveSlackChannel(campaign.channelId);
  await postOptionalNotification(`Campaign channel *#${campaign.channelName}* was archived by the relay.`);
  await logRelayAction({ campaignId: campaign.id, action: "campaign_channel_archive", outcome: "success", detail: "Campaign channel archived." });
}
