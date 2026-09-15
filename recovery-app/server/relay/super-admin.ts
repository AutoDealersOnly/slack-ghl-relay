import { cancelScheduledCampaignArchive } from "./archive-jobs";
import {
  claimPendingSuperAdminArchiveControl,
  getActiveSuperAdminChannel,
  getCampaignById,
  getSuperAdminArchiveControl,
  listPendingCampaignArchives,
  logRelayAction,
  saveSuperAdminArchiveControl,
  saveSuperAdminChannel,
  updateSuperAdminArchiveControlStatus,
  updateSuperAdminCanvasId,
} from "./db";
import {
  createOrUpdateSuperAdminCanvas,
  findSlackChannelByName,
  getSlackChannelInfo,
  postSlackBlocks,
  type SlackBlock,
  updateSlackMessage,
} from "./slack";
import { redactErrorDetail } from "./security";

export const SUPER_ADMIN_CHANNEL_NAME = "super-admin";
export const SUPER_ADMIN_KEEP_OPEN_ACTION = "super_admin_keep_open";

type PendingArchive = Awaited<ReturnType<typeof listPendingCampaignArchives>>[number];

const escapeSlackText = (value: string | null | undefined): string =>
  (value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const formatArchiveDate = (value: Date | string | null): string => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
};

export function buildSuperAdminCanvas(): string {
  return `# ADO Super Admin

## What this channel is for

Use this private channel as the shared control point for approved GoHighLevel and Slack automations. It contains plain-language instructions and only narrow, tested controls. It never contains keys, passwords, private links, or other protected settings.

## Current working control

### Campaign channel archive

Campaign channels are normally scheduled to archive three calendar days after the Event End date. When a pending archive appears below, select **Keep Open** only when that campaign needs to stay active. That cancels only that channel’s pending archive. It does not change its Event End date or any other campaign.

## Automation guide

| Automation | Normal purpose | Available here now |
|---|---|---|
| Production Canvas | Keeps the campaign’s Production Canvas current. | Instructions only. |
| Proof-stage messages | Posts proof-stage messages to the correct campaign channel. | Instructions only. |
| BDC mailpiece images | Updates the linked dealership’s mailpiece images after Sent to Print. | Instructions only. |
| Campaign channel archive | Warns before and archives after Event End. | **Keep Open** for one pending campaign. |
| Campaign custom values | Updates approved campaign values when a job moves to Post Production. | Instructions only. |
| Dealership custom values | Updates approved dealership values after verification. | Instructions only. |
| QR Pass Page Builder | Generates dealership-specific QR Pass Page code. | Instructions only. |
| PIN Code Lookup | Helps operators find and update an existing customer record. | Instructions only. |
| Active Call Lookup — Test | Separate ABC-only test; not a live call-center control. | Instructions only. |

## Important limits

This channel does not change GoHighLevel workflows, protected settings, call-center routing, users, recordings, numbers, proof stages, or customer records. New controls are added one at a time only after they are tested and approved.`;
}

export function buildPendingArchiveControlMessage(campaign: PendingArchive): { text: string; blocks: SlackBlock[] } {
  const channel = escapeSlackText(campaign.channelName);
  const production = escapeSlackText(campaign.productionName);
  const eventEnd = escapeSlackText(campaign.eventEndDate ?? "Not available");
  const archiveDate = formatArchiveDate(campaign.archiveAfter);
  return {
    text: `Archive pending for #${campaign.channelName}. Select Keep Open only if this campaign needs to remain active.`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Campaign archive pending", emoji: false } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Campaign*\n${production}` },
          { type: "mrkdwn", text: `*Channel*\n#${channel}` },
          { type: "mrkdwn", text: `*Event End*\n${eventEnd}` },
          { type: "mrkdwn", text: `*Scheduled Archive*\n${archiveDate}` },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Keep Open", emoji: false },
            action_id: SUPER_ADMIN_KEEP_OPEN_ACTION,
            value: String(campaign.id),
          },
        ],
      },
    ],
  };
}

export function buildArchiveControlResultMessage(campaign: PendingArchive, status: "kept_open" | "archived" | "failed"): { text: string; blocks: SlackBlock[] } {
  const channel = escapeSlackText(campaign.channelName);
  const message = status === "kept_open"
    ? `#${channel} will remain open. Its pending archive was cancelled.`
    : status === "archived"
      ? `#${channel} has been archived through its normal campaign schedule.`
      : `#${channel} could not be updated. Contact admin before taking any further action.`;
  return {
    text: message,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Campaign archive status", emoji: false } },
      { type: "section", text: { type: "mrkdwn", text: message } },
    ],
  };
}

export async function setUpSuperAdminChannel(channelId: string): Promise<{ pendingControls: number }> {
  const channel = await getSlackChannelInfo(channelId);
  if (!channel.is_private || channel.name !== SUPER_ADMIN_CHANNEL_NAME) {
    throw new Error("Super Admin setup requires the private #super-admin channel with the bot invited.");
  }
  const saved = await saveSuperAdminChannel({ channelId: channel.id, channelName: channel.name });
  if (!saved) throw new Error("Super Admin channel could not be saved.");
  const canvasId = await createOrUpdateSuperAdminCanvas(channel.id, buildSuperAdminCanvas(), saved.canvasId);
  await updateSuperAdminCanvasId(canvasId);
  const pending = await listPendingCampaignArchives();
  for (const campaign of pending) await syncSuperAdminPendingArchive(campaign);
  await logRelayAction({ action: "super_admin_setup", outcome: "success", detail: "Private Super Admin Canvas and pending archive controls were refreshed." });
  return { pendingControls: pending.length };
}

/** Finds the deliberate user-created channel by its exact name, then performs private setup validation. */
export async function setUpNamedSuperAdminChannel(): Promise<{ pendingControls: number }> {
  const channel = await findSlackChannelByName(SUPER_ADMIN_CHANNEL_NAME);
  if (!channel) throw new Error("The bot cannot see #super-admin. Create it as private and invite the existing relay bot first.");
  return setUpSuperAdminChannel(channel.id);
}

/** Creates or refreshes the one Super Admin control message for one still-pending archive. */
export async function syncSuperAdminPendingArchive(campaign: PendingArchive): Promise<void> {
  const superAdmin = await getActiveSuperAdminChannel();
  if (!superAdmin || campaign.archiveStatus !== "scheduled" || !campaign.archiveTaskUid) return;
  const message = buildPendingArchiveControlMessage(campaign);
  const existing = await getSuperAdminArchiveControl(campaign.id);
  let messageTs = existing?.slackMessageTs ?? "";
  try {
    if (existing?.superAdminChannelId === superAdmin.channelId) {
      await updateSlackMessage(superAdmin.channelId, existing.slackMessageTs, message.text, message.blocks);
    } else {
      messageTs = (await postSlackBlocks(superAdmin.channelId, message.text, message.blocks)).ts;
    }
  } catch {
    messageTs = (await postSlackBlocks(superAdmin.channelId, message.text, message.blocks)).ts;
  }
  await saveSuperAdminArchiveControl({
    campaignId: campaign.id,
    superAdminChannelId: superAdmin.channelId,
    slackMessageTs: messageTs,
    status: "pending",
  });
}

export async function keepOneCampaignChannelOpen(input: { superAdminChannelId: string; campaignId: number; messageTs: string }): Promise<"kept_open" | "already_handled" | "not_allowed"> {
  const superAdmin = await getActiveSuperAdminChannel();
  if (!superAdmin || superAdmin.channelId !== input.superAdminChannelId) return "not_allowed";
  const campaign = await getCampaignById(input.campaignId);
  const control = await getSuperAdminArchiveControl(input.campaignId);
  if (
    !campaign ||
    campaign.archiveStatus !== "scheduled" ||
    !campaign.archiveTaskUid ||
    !control ||
    control.status !== "pending" ||
    control.superAdminChannelId !== superAdmin.channelId ||
    control.slackMessageTs !== input.messageTs
  ) return "already_handled";

  const claimed = await claimPendingSuperAdminArchiveControl({ campaignId: campaign.id, superAdminChannelId: superAdmin.channelId });
  if (!claimed) return "already_handled";
  try {
    await cancelScheduledCampaignArchive(campaign);
    await updateSuperAdminArchiveControlStatus(campaign.id, "kept_open");
    const message = buildArchiveControlResultMessage(campaign, "kept_open");
    await updateSlackMessage(superAdmin.channelId, control.slackMessageTs, message.text, message.blocks);
    await logRelayAction({ campaignId: campaign.id, action: "super_admin_keep_channel_open", outcome: "success", detail: "Super Admin cancelled this campaign channel’s pending archive." });
    return "kept_open";
  } catch (error) {
    await updateSuperAdminArchiveControlStatus(campaign.id, "failed").catch(() => undefined);
    await logRelayAction({ campaignId: campaign.id, action: "super_admin_keep_channel_open", outcome: "failed", detail: redactErrorDetail(error) }).catch(() => undefined);
    const message = buildArchiveControlResultMessage(campaign, "failed");
    await updateSlackMessage(superAdmin.channelId, control.slackMessageTs, message.text, message.blocks).catch(() => undefined);
    throw error;
  }
}

/** Marks the matching bot message as archived after the normal archive job has already succeeded. */
export async function markSuperAdminArchiveCompleted(campaign: PendingArchive): Promise<void> {
  const superAdmin = await getActiveSuperAdminChannel();
  const control = await getSuperAdminArchiveControl(campaign.id);
  if (!superAdmin || !control || control.status !== "pending" || control.superAdminChannelId !== superAdmin.channelId) return;
  await updateSuperAdminArchiveControlStatus(campaign.id, "archived");
  const message = buildArchiveControlResultMessage(campaign, "archived");
  await updateSlackMessage(superAdmin.channelId, control.slackMessageTs, message.text, message.blocks);
}
