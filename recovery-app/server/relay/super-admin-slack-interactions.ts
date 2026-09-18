import type { Request, Response } from "express";
import { Router } from "express";
import { getRelayConfig } from "./config";
import {
  keepOneCampaignChannelOpen,
  openCanvasRepairPicker,
  openPendingArchiveManager,
  postCanvasRepairResult,
  repairOneProductionCanvas,
  SUPER_ADMIN_KEEP_OPEN_ACTION,
  SUPER_ADMIN_MANAGE_ARCHIVES_ACTION,
  SUPER_ADMIN_REPAIR_CANVAS_ACTION,
} from "./super-admin";
import { isAuthorizedSlackRequest } from "./security";

type SlackInteractionRequest = Request & { rawBody?: string };
type SlackBlockAction = { action_id?: string; value?: string };
type SlackInteractionPayload = {
  type?: string;
  channel?: { id?: string };
  trigger_id?: string;
  actions?: SlackBlockAction[];
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: { values?: Record<string, Record<string, { selected_option?: { value?: string } }> > };
  };
};

export type KeepOpenInteraction = { superAdminChannelId: string; campaignId: number };
export type SuperAdminLauncherInteraction = { superAdminChannelId: string; triggerId: string };
export type SuperAdminCampaignSubmission = { superAdminChannelId: string; campaignId: number };

const CANVAS_REFRESH_CALLBACK_ID = "super_admin_repair_production_canvas_submit";
const ARCHIVE_MANAGER_CALLBACK_ID = "super_admin_manage_pending_archives_submit";

const parseInteractionPayload = (payloadText: unknown): SlackInteractionPayload | null => {
  if (typeof payloadText !== "string" || payloadText.length > 25_000) return null;
  try {
    return JSON.parse(payloadText) as SlackInteractionPayload;
  } catch {
    return null;
  }
};

/** Parses the legacy individual Keep Open card while it is being retired; it still rechecks current archive state. */
export function parseKeepOpenInteraction(payloadText: unknown): KeepOpenInteraction | null {
  const payload = parseInteractionPayload(payloadText);
  const action = payload?.actions?.[0];
  const campaignId = Number(action?.value);
  const superAdminChannelId = payload?.channel?.id?.trim() ?? "";
  if (
    payload?.type !== "block_actions" ||
    action?.action_id !== SUPER_ADMIN_KEEP_OPEN_ACTION ||
    !Number.isSafeInteger(campaignId) ||
    campaignId <= 0 ||
    !superAdminChannelId
  ) return null;
  return { superAdminChannelId, campaignId };
}

/** Parses either one permanent Super Admin launcher button. */
export function parseSuperAdminLauncherInteraction(payloadText: unknown, actionId: string): SuperAdminLauncherInteraction | null {
  const payload = parseInteractionPayload(payloadText);
  const action = payload?.actions?.[0];
  const superAdminChannelId = payload?.channel?.id?.trim() ?? "";
  const triggerId = payload?.trigger_id?.trim() ?? "";
  if (payload?.type !== "block_actions" || action?.action_id !== actionId || !superAdminChannelId || !triggerId) return null;
  return { superAdminChannelId, triggerId };
}

/** Parses a submitted private Super Admin modal that selects exactly one current campaign. */
export function parseSuperAdminCampaignSubmission(payloadText: unknown, callbackId: string, blockId: string, actionId: string): SuperAdminCampaignSubmission | null {
  const payload = parseInteractionPayload(payloadText);
  const view = payload?.view;
  const selected = view?.state?.values?.[blockId]?.[actionId]?.selected_option?.value;
  const campaignId = Number(selected);
  let superAdminChannelId = "";
  try {
    const metadata = JSON.parse(view?.private_metadata ?? "") as { superAdminChannelId?: unknown };
    if (typeof metadata.superAdminChannelId === "string") superAdminChannelId = metadata.superAdminChannelId.trim();
  } catch {
    return null;
  }
  if (payload?.type !== "view_submission" || view?.callback_id !== callbackId || !superAdminChannelId || !Number.isSafeInteger(campaignId) || campaignId <= 0) return null;
  return { superAdminChannelId, campaignId };
}

const superAdminSlackInteractionRouter = Router();

superAdminSlackInteractionRouter.post("/", async (req: SlackInteractionRequest, res: Response) => {
  const config = getRelayConfig();
  const authorized = isAuthorizedSlackRequest({
    signingSecret: config.slackSigningSecret,
    timestamp: req.header("x-slack-request-timestamp") ?? undefined,
    signature: req.header("x-slack-signature") ?? undefined,
    rawBody: req.rawBody,
  });
  if (!authorized) {
    res.status(401).send("Unauthorized Slack interaction");
    return;
  }

  const payloadText = (req.body as { payload?: unknown }).payload;
  const archiveManager = parseSuperAdminLauncherInteraction(payloadText, SUPER_ADMIN_MANAGE_ARCHIVES_ACTION);
  if (archiveManager) {
    try {
      const result = await openPendingArchiveManager(archiveManager);
      if (result === "opened") res.status(200).send("");
      else if (result === "no_campaigns") res.status(200).json({ response_type: "ephemeral", text: "There are no campaign channels currently scheduled to archive." });
      else res.status(200).json({ response_type: "ephemeral", text: "This archive control is not available here." });
    } catch {
      res.status(200).json({ response_type: "ephemeral", text: "The archive manager could not be opened. Contact admin before retrying." });
    }
    return;
  }

  const archiveSubmission = parseSuperAdminCampaignSubmission(
    payloadText,
    ARCHIVE_MANAGER_CALLBACK_ID,
    "super_admin_pending_archive_campaign",
    "super_admin_pending_archive_campaign_select"
  );
  if (archiveSubmission) {
    res.status(200).json({ response_action: "clear" });
    void keepOneCampaignChannelOpen(archiveSubmission).catch(() => undefined);
    return;
  }

  const refreshLauncher = parseSuperAdminLauncherInteraction(payloadText, SUPER_ADMIN_REPAIR_CANVAS_ACTION);
  if (refreshLauncher) {
    try {
      const result = await openCanvasRepairPicker(refreshLauncher);
      if (result === "opened") res.status(200).send("");
      else if (result === "no_campaigns") res.status(200).json({ response_type: "ephemeral", text: "There are no campaign Canvases available to refresh." });
      else res.status(200).json({ response_type: "ephemeral", text: "This Canvas refresh control is not available here." });
    } catch {
      res.status(200).json({ response_type: "ephemeral", text: "The Canvas refresh picker could not be opened. Contact admin before retrying." });
    }
    return;
  }

  const refreshSubmission = parseSuperAdminCampaignSubmission(
    payloadText,
    CANVAS_REFRESH_CALLBACK_ID,
    "super_admin_canvas_repair_campaign",
    "super_admin_canvas_repair_campaign_select"
  );
  if (refreshSubmission) {
    res.status(200).json({ response_action: "clear" });
    void (async () => {
      try {
        const result = await repairOneProductionCanvas(refreshSubmission);
        await postCanvasRepairResult({ ...refreshSubmission, result });
      } catch {
        await postCanvasRepairResult({ ...refreshSubmission, result: "not_allowed" }).catch(() => undefined);
      }
    })();
    return;
  }

  const legacyKeepOpen = parseKeepOpenInteraction(payloadText);
  if (legacyKeepOpen) {
    res.status(200).json({ response_type: "ephemeral", text: "Checking this campaign archive now." });
    void keepOneCampaignChannelOpen(legacyKeepOpen).catch(() => undefined);
    return;
  }

  res.status(200).json({ response_type: "ephemeral", text: "This Super Admin action is not available." });
});

export { superAdminSlackInteractionRouter };
