import {
  claimPendingSuperAdminArchiveControl,
  getActiveSuperAdminChannel,
  getCampaignById,
  getSuperAdminArchiveControl,
  listPendingCampaignArchives,
  listSuperAdminArchiveControls,
  listSuperAdminCanvasRepairCandidates,
  logRelayAction,
  saveSuperAdminArchiveControl,
  saveSuperAdminChannel,
  updateSuperAdminArchiveControlStatus,
  updateSuperAdminArchiveManagerMessageTs,
  updateSuperAdminCanvasId,
  updateSuperAdminCanvasRepairMessageTs,
} from "./db";
import { cancelScheduledCampaignArchive } from "./archive-jobs";
import {
  createOrUpdateSuperAdminCanvas,
  deleteSlackMessage,
  findSlackChannelByName,
  getSlackChannelInfo,
  openPendingArchiveManagerModal,
  openProductionCanvasRepairModal,
  postSlackBlocks,
  postSlackMessage,
  type SlackBlock,
  updateSlackMessage,
} from "./slack";
import { redactErrorDetail } from "./security";
import { refreshKnownProductionCanvasOnly } from "./workflows";

export const SUPER_ADMIN_CHANNEL_NAME = "super-admin";
export const SUPER_ADMIN_KEEP_OPEN_ACTION = "super_admin_keep_open";
export const SUPER_ADMIN_MANAGE_ARCHIVES_ACTION = "super_admin_manage_pending_archives";
export const SUPER_ADMIN_REPAIR_CANVAS_ACTION = "super_admin_repair_production_canvas";

type PendingArchive = Awaited<ReturnType<typeof listPendingCampaignArchives>>[number];

const escapeSlackText = (value: string | null | undefined): string =>
  (value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const formatArchiveDate = (value: Date | string | null): string => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
};

const buildPendingArchiveList = (pending: PendingArchive[]): string => {
  if (pending.length === 0) return "There are currently no campaign channels scheduled to archive.";
  const lines = pending.map(campaign =>
    `| ${escapeSlackText(campaign.productionName)} | #${escapeSlackText(campaign.channelName)} | ${escapeSlackText(campaign.eventEndDate ?? "Not available")} | ${formatArchiveDate(campaign.archiveAfter)} |`
  );
  return [
    "| Campaign | Channel | Event End | Scheduled Archive |",
    "| --- | --- | --- | --- |",
    ...lines,
  ].join("\n");
};

export function buildSuperAdminCanvas(pending: PendingArchive[] = []): string {
  return `# ADO Super Admin

## What this channel is for

Use this private channel as the shared control point for approved GoHighLevel and Slack automations. It contains plain-language instructions and only narrow, tested controls. It never contains keys, passwords, private links, or other protected settings.

## Current working controls

### Campaign channel archive

Campaign channels are normally scheduled to archive three calendar days after the Event End date. The live list is below. Use the **Manage Pending Archives** message in this channel when one selected campaign needs to stay open. That cancels only that channel’s pending archive. It does not change its Event End date or any other campaign.

### Production Canvas refresh

Use **Refresh Production Canvas** only when a channel’s existing Production Canvas needs current information. The control edits the saved Canvas directly. It never creates a Canvas and never relinks a Canvas. If a channel has no saved Canvas link, it stops and tells the administrator to contact David rather than adding a blank or duplicate tab.

## Pending campaign-channel archives

${buildPendingArchiveList(pending)}

## Automation guide

| Automation | Normal purpose | Available here now |
| --- | --- | --- |
| Production Canvas | Keeps the campaign’s Production Canvas current. | **Refresh Production Canvas** edits a saved Canvas only; no Canvas is created or relinked. |
| Proof-stage messages | Posts proof-stage messages to the correct campaign channel. | Instructions only. |
| BDC mailpiece images | Updates the linked dealership’s mailpiece images after Sent to Print. | Instructions only. |
| Campaign channel archive | Warns before and archives after Event End. | **Manage Pending Archives** lets an admin choose **Keep Open** for one current pending campaign. |
| Campaign custom values | Updates approved campaign values when a job moves to Post Production. | Instructions only. |
| Dealership custom values | Updates approved dealership values after verification. | Instructions only. |
| QR Pass Page Builder | Generates dealership-specific QR Pass Page code. | Instructions only. |
| PIN Code Lookup | Helps operators find and update an existing customer record. | Instructions only. |
| Active Call Lookup — Test | Separate ABC-only test; not a live call-center control. | Instructions only. |

## Important limits

This channel does not change GoHighLevel workflows, protected settings, call-center routing, users, recordings, numbers, proof stages, or customer records. **All automation testing happens in ABC Test only.** An active campaign channel is hands-off for testing unless David explicitly approves that exact exception. New controls are added one at a time only after they are tested and approved.`;
}

/** Retained for the prior-message cleanup only; new archive controls are presented in the Canvas and modal. */
export function buildPendingArchiveControlMessage(campaign: PendingArchive): { text: string; blocks: SlackBlock[] } {
  const channel = escapeSlackText(campaign.channelName);
  const production = escapeSlackText(campaign.productionName);
  return {
    text: `Archive pending for #${channel}.`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Campaign archive pending", emoji: false } },
      { type: "section", text: { type: "mrkdwn", text: `*Campaign*\n${production}\n*Channel*\n#${channel}` } },
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

export function buildCanvasRepairLauncherMessage(): { text: string; blocks: SlackBlock[] } {
  return {
    text: "Refresh one existing Production Canvas without creating a new Canvas.",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Production Canvas refresh", emoji: false } },
      {
        type: "section",
        text: { type: "mrkdwn", text: "Choose one campaign channel to refresh its **existing saved Production Canvas**. This control edits a saved Canvas only. It cannot create or relink a Canvas, so a missing saved link stops safely instead of creating a blank or duplicate tab." },
      },
      {
        type: "actions",
        elements: [{
          type: "button",
          text: { type: "plain_text", text: "Refresh Production Canvas", emoji: false },
          action_id: SUPER_ADMIN_REPAIR_CANVAS_ACTION,
        }],
      },
    ],
  };
}

export function buildArchiveManagerLauncherMessage(): { text: string; blocks: SlackBlock[] } {
  return {
    text: "Manage the current campaign channels scheduled to archive.",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Campaign archive management", emoji: false } },
      {
        type: "section",
        text: { type: "mrkdwn", text: "The current pending archive list is kept in the **ADO Super Admin Canvas**. Choose one campaign here only when it needs to remain open. This cancels one matching pending archive and changes no Event End date or other campaign." },
      },
      {
        type: "actions",
        elements: [{
          type: "button",
          text: { type: "plain_text", text: "Manage Pending Archives", emoji: false },
          action_id: SUPER_ADMIN_MANAGE_ARCHIVES_ACTION,
        }],
      },
    ],
  };
}

async function syncSuperAdminCanvas(pending: PendingArchive[]): Promise<void> {
  const superAdmin = await getActiveSuperAdminChannel();
  if (!superAdmin) return;
  const canvasId = await createOrUpdateSuperAdminCanvas(superAdmin.channelId, buildSuperAdminCanvas(pending), superAdmin.canvasId);
  if (canvasId !== superAdmin.canvasId) await updateSuperAdminCanvasId(canvasId);
}

/** Creates or updates the one Production Canvas refresh launcher in private #super-admin. */
async function syncSuperAdminCanvasRefreshLauncher(): Promise<void> {
  const superAdmin = await getActiveSuperAdminChannel();
  if (!superAdmin) return;
  const message = buildCanvasRepairLauncherMessage();
  let messageTs = superAdmin.canvasRepairMessageTs ?? "";
  try {
    if (messageTs) await updateSlackMessage(superAdmin.channelId, messageTs, message.text, message.blocks);
    else messageTs = (await postSlackBlocks(superAdmin.channelId, message.text, message.blocks)).ts;
  } catch {
    messageTs = (await postSlackBlocks(superAdmin.channelId, message.text, message.blocks)).ts;
  }
  await updateSuperAdminCanvasRepairMessageTs(messageTs);
}

/** Creates or updates the one permanent Manage Pending Archives launcher in private #super-admin. */
async function syncSuperAdminArchiveManagerLauncher(): Promise<string | null> {
  const superAdmin = await getActiveSuperAdminChannel();
  if (!superAdmin) return null;
  const message = buildArchiveManagerLauncherMessage();
  let messageTs = superAdmin.archiveManagerMessageTs ?? "";
  try {
    if (messageTs) await updateSlackMessage(superAdmin.channelId, messageTs, message.text, message.blocks);
    else messageTs = (await postSlackBlocks(superAdmin.channelId, message.text, message.blocks)).ts;
  } catch {
    messageTs = (await postSlackBlocks(superAdmin.channelId, message.text, message.blocks)).ts;
  }
  await updateSuperAdminArchiveManagerMessageTs(messageTs);
  return messageTs;
}

/** Removes old bot-authored individual archive cards once, after the Canvas list and permanent manager exist. */
async function removeLegacyPendingArchiveMessages(superAdminChannelId: string, archiveManagerMessageTs: string | null): Promise<void> {
  const controls = await listSuperAdminArchiveControls(superAdminChannelId);
  for (const control of controls) {
    if (!control.slackMessageTs || control.slackMessageTs === archiveManagerMessageTs) continue;
    await deleteSlackMessage(superAdminChannelId, control.slackMessageTs).catch(() => undefined);
  }
}

/** Refreshes the private Canvas list and its two permanent launcher messages without touching any campaign channel. */
export async function syncSuperAdminArchiveDashboard(): Promise<void> {
  const superAdmin = await getActiveSuperAdminChannel();
  if (!superAdmin) return;
  const hadArchiveManager = Boolean(superAdmin.archiveManagerMessageTs);
  const pending = await listPendingCampaignArchives();
  await syncSuperAdminCanvas(pending);
  await syncSuperAdminCanvasRefreshLauncher();
  const archiveManagerMessageTs = await syncSuperAdminArchiveManagerLauncher();
  if (!hadArchiveManager) await removeLegacyPendingArchiveMessages(superAdmin.channelId, archiveManagerMessageTs);
  if (!archiveManagerMessageTs) return;
  for (const campaign of pending) {
    await saveSuperAdminArchiveControl({
      campaignId: campaign.id,
      superAdminChannelId: superAdmin.channelId,
      slackMessageTs: archiveManagerMessageTs,
      status: "pending",
    });
  }
}

export async function setUpSuperAdminChannel(channelId: string): Promise<{ pendingControls: number }> {
  const channel = await getSlackChannelInfo(channelId);
  if (!channel.is_private || channel.name !== SUPER_ADMIN_CHANNEL_NAME) {
    throw new Error("Super Admin setup requires the private #super-admin channel with the bot invited.");
  }
  const saved = await saveSuperAdminChannel({ channelId: channel.id, channelName: channel.name });
  if (!saved) throw new Error("Super Admin channel could not be saved.");
  await syncSuperAdminArchiveDashboard();
  const pending = await listPendingCampaignArchives();
  await logRelayAction({ action: "super_admin_setup", outcome: "success", detail: "Private Super Admin Canvas and permanent control messages were refreshed." });
  return { pendingControls: pending.length };
}

/** Finds the deliberate user-created channel by exact name, then performs private setup validation. */
export async function setUpNamedSuperAdminChannel(): Promise<{ pendingControls: number }> {
  const channel = await findSlackChannelByName(SUPER_ADMIN_CHANNEL_NAME);
  if (!channel) throw new Error("The bot cannot see #super-admin. Create it as private and invite the existing relay bot first.");
  return setUpSuperAdminChannel(channel.id);
}

/** Uses only an administrator-supplied private channel reference when Slack private-channel lookup is unavailable. */
export async function setUpConfirmedPrivateSuperAdminChannel(channelId: string): Promise<{ pendingControls: number }> {
  const existing = await getActiveSuperAdminChannel();
  if (existing && existing.channelId !== channelId) throw new Error("A different Super Admin channel is already active. Contact admin before changing it.");
  const saved = await saveSuperAdminChannel({ channelId, channelName: SUPER_ADMIN_CHANNEL_NAME, canvasId: existing?.canvasId });
  if (!saved) throw new Error("Super Admin channel could not be saved.");
  await syncSuperAdminArchiveDashboard();
  const pending = await listPendingCampaignArchives();
  await logRelayAction({ action: "super_admin_setup", outcome: "success", detail: "Private Super Admin Canvas and permanent control messages were refreshed using the administrator-confirmed channel reference." });
  return { pendingControls: pending.length };
}

/** Replaces the old per-campaign card behavior with a Canvas list and durable campaign state row. */
export async function syncSuperAdminPendingArchive(campaign: PendingArchive): Promise<void> {
  const superAdmin = await getActiveSuperAdminChannel();
  if (!superAdmin || campaign.archiveStatus !== "scheduled" || !campaign.archiveTaskUid) return;
  const managerTs = superAdmin.archiveManagerMessageTs ?? "canvas-list";
  await saveSuperAdminArchiveControl({
    campaignId: campaign.id,
    superAdminChannelId: superAdmin.channelId,
    slackMessageTs: managerTs,
    status: "pending",
  });
  await syncSuperAdminArchiveDashboard();
}

/** Opens one private, current-state archive picker. The Canvas remains the list; the modal is the action step. */
export async function openPendingArchiveManager(input: { superAdminChannelId: string; triggerId: string }): Promise<"opened" | "not_allowed" | "no_campaigns"> {
  const superAdmin = await getActiveSuperAdminChannel();
  if (!superAdmin || superAdmin.channelId !== input.superAdminChannelId) return "not_allowed";
  const pending = await listPendingCampaignArchives();
  if (pending.length === 0) return "no_campaigns";
  await openPendingArchiveManagerModal({
    triggerId: input.triggerId,
    superAdminChannelId: superAdmin.channelId,
    candidates: pending.map(campaign => ({ id: campaign.id, productionName: campaign.productionName, channelName: campaign.channelName })),
  });
  return "opened";
}

/** Cancels exactly one still-current archive schedule selected from the permanent manager modal. */
export async function keepOneCampaignChannelOpen(input: { superAdminChannelId: string; campaignId: number }): Promise<"kept_open" | "already_handled" | "not_allowed"> {
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
    control.superAdminChannelId !== superAdmin.channelId
  ) return "already_handled";

  const claimed = await claimPendingSuperAdminArchiveControl({ campaignId: campaign.id, superAdminChannelId: superAdmin.channelId });
  if (!claimed) return "already_handled";
  try {
    await cancelScheduledCampaignArchive(campaign);
    await updateSuperAdminArchiveControlStatus(campaign.id, "kept_open");
    await syncSuperAdminArchiveDashboard();
    await logRelayAction({ campaignId: campaign.id, action: "super_admin_keep_channel_open", outcome: "success", detail: "Super Admin cancelled this campaign channel’s pending archive." });
    return "kept_open";
  } catch (error) {
    await updateSuperAdminArchiveControlStatus(campaign.id, "failed").catch(() => undefined);
    await logRelayAction({ campaignId: campaign.id, action: "super_admin_keep_channel_open", outcome: "failed", detail: redactErrorDetail(error) }).catch(() => undefined);
    throw error;
  }
}

/** Opens the all-channel Canvas refresh picker, but the eventual action can edit only a saved Canvas. */
export async function openCanvasRepairPicker(input: { superAdminChannelId: string; triggerId: string }): Promise<"opened" | "not_allowed" | "no_campaigns"> {
  const superAdmin = await getActiveSuperAdminChannel();
  if (!superAdmin || superAdmin.channelId !== input.superAdminChannelId) return "not_allowed";
  const candidates = (await listSuperAdminCanvasRepairCandidates()).filter(candidate => Boolean(candidate.canvasId));
  if (candidates.length === 0) return "no_campaigns";
  await openProductionCanvasRepairModal({
    triggerId: input.triggerId,
    superAdminChannelId: superAdmin.channelId,
    candidates,
  });
  return "opened";
}

/** Refreshes only the selected campaign's saved Canvas. There is deliberately no create or relink path. */
export async function repairOneProductionCanvas(input: { superAdminChannelId: string; campaignId: number }): Promise<"repaired" | "not_allowed" | "canvas_link_missing" | "not_found"> {
  const superAdmin = await getActiveSuperAdminChannel();
  if (!superAdmin || superAdmin.channelId !== input.superAdminChannelId) return "not_allowed";
  const campaign = await getCampaignById(input.campaignId);
  if (!campaign?.channelId) return "not_found";
  if (!campaign.canvasId) return "canvas_link_missing";
  const result = await refreshKnownProductionCanvasOnly({ production_name: campaign.productionName, channel_name: campaign.channelName });
  if (result === "campaign_not_found") return "not_found";
  if (result === "canvas_link_missing") return "canvas_link_missing";
  await logRelayAction({ campaignId: campaign.id, action: "super_admin_refresh_production_canvas", outcome: "success", detail: "Super Admin refreshed only this campaign’s saved Production Canvas without creating or relinking a Canvas." });
  return "repaired";
}

/** Posts a plain, non-sensitive outcome in the private Super Admin channel after the refresh modal closes. */
export async function postCanvasRepairResult(input: { superAdminChannelId: string; campaignId: number; result: Awaited<ReturnType<typeof repairOneProductionCanvas>> }): Promise<void> {
  const campaign = await getCampaignById(input.campaignId);
  const channel = campaign ? `#${escapeSlackText(campaign.channelName)}` : "the selected campaign";
  const text = input.result === "repaired"
    ? `${channel} Production Canvas was refreshed in place. No Canvas was created or relinked.`
    : input.result === "canvas_link_missing"
      ? `${channel} has no saved Production Canvas link. No Canvas was created. Contact David before retrying.`
      : `${channel} could not be refreshed. No Canvas was changed.`;
  await postSlackMessage(input.superAdminChannelId, text);
}

/** Removes an archived campaign from the Canvas list after its normal archive job succeeds. */
export async function markSuperAdminArchiveCompleted(campaign: PendingArchive): Promise<void> {
  const superAdmin = await getActiveSuperAdminChannel();
  const control = await getSuperAdminArchiveControl(campaign.id);
  if (!superAdmin || !control || control.status !== "pending" || control.superAdminChannelId !== superAdmin.channelId) return;
  await updateSuperAdminArchiveControlStatus(campaign.id, "archived");
  await syncSuperAdminArchiveDashboard();
}
