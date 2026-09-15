import type { Request, Response } from "express";
import { Router } from "express";
import { getRelayConfig } from "./config";
import {
  keepOneCampaignChannelOpen,
  openCanvasRepairPicker,
  postCanvasRepairResult,
  repairOneProductionCanvas,
  SUPER_ADMIN_KEEP_OPEN_ACTION,
  SUPER_ADMIN_REPAIR_CANVAS_ACTION,
} from "./super-admin";
import { isAuthorizedSlackRequest } from "./security";

type SlackInteractionRequest = Request & { rawBody?: string };
type SlackBlockAction = { action_id?: string; value?: string };
type SlackInteractionPayload = {
  type?: string;
  channel?: { id?: string };
  message?: { ts?: string };
  trigger_id?: string;
  actions?: SlackBlockAction[];
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: { values?: Record<string, Record<string, { selected_option?: { value?: string } }> > };
  };
};

export type KeepOpenInteraction = { superAdminChannelId: string; campaignId: number; messageTs: string };
export type CanvasRepairLauncherInteraction = { superAdminChannelId: string; triggerId: string };
export type CanvasRepairSubmission = { superAdminChannelId: string; campaignId: number };

const CANVAS_REPAIR_CALLBACK_ID = "super_admin_repair_production_canvas_submit";

/** Parses only the one supported Super Admin action from Slack’s signed form payload. */
export function parseKeepOpenInteraction(payloadText: unknown): KeepOpenInteraction | null {
  if (typeof payloadText !== "string" || payloadText.length > 25_000) return null;
  let payload: SlackInteractionPayload;
  try {
    payload = JSON.parse(payloadText) as SlackInteractionPayload;
  } catch {
    return null;
  }
  const action = payload.actions?.[0];
  const campaignId = Number(action?.value);
  const superAdminChannelId = payload.channel?.id?.trim() ?? "";
  const messageTs = payload.message?.ts?.trim() ?? "";
  if (
    payload.type !== "block_actions" ||
    action?.action_id !== SUPER_ADMIN_KEEP_OPEN_ACTION ||
    !Number.isSafeInteger(campaignId) ||
    campaignId <= 0 ||
    !superAdminChannelId ||
    !messageTs
  ) return null;
  return { superAdminChannelId, campaignId, messageTs };
}

/** Parses only the signed private-channel button that opens the one-campaign repair picker. */
export function parseCanvasRepairLauncherInteraction(payloadText: unknown): CanvasRepairLauncherInteraction | null {
  if (typeof payloadText !== "string" || payloadText.length > 25_000) return null;
  let payload: SlackInteractionPayload;
  try {
    payload = JSON.parse(payloadText) as SlackInteractionPayload;
  } catch {
    return null;
  }
  const action = payload.actions?.[0];
  const superAdminChannelId = payload.channel?.id?.trim() ?? "";
  const triggerId = payload.trigger_id?.trim() ?? "";
  if (payload.type !== "block_actions" || action?.action_id !== SUPER_ADMIN_REPAIR_CANVAS_ACTION || !superAdminChannelId || !triggerId) return null;
  return { superAdminChannelId, triggerId };
}

/** Parses only a submitted repair modal carrying the private Super Admin channel context. */
export function parseCanvasRepairSubmission(payloadText: unknown): CanvasRepairSubmission | null {
  if (typeof payloadText !== "string" || payloadText.length > 25_000) return null;
  let payload: SlackInteractionPayload;
  try {
    payload = JSON.parse(payloadText) as SlackInteractionPayload;
  } catch {
    return null;
  }
  const view = payload.view;
  const selected = view?.state?.values?.super_admin_canvas_repair_campaign?.super_admin_canvas_repair_campaign_select?.selected_option?.value;
  const campaignId = Number(selected);
  let superAdminChannelId = "";
  try {
    const metadata = JSON.parse(view?.private_metadata ?? "") as { superAdminChannelId?: unknown };
    if (typeof metadata.superAdminChannelId === "string") superAdminChannelId = metadata.superAdminChannelId.trim();
  } catch {
    return null;
  }
  if (payload.type !== "view_submission" || view?.callback_id !== CANVAS_REPAIR_CALLBACK_ID || !superAdminChannelId || !Number.isSafeInteger(campaignId) || campaignId <= 0) return null;
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
  const launcher = parseCanvasRepairLauncherInteraction(payloadText);
  if (launcher) {
    try {
      const result = await openCanvasRepairPicker(launcher);
      if (result === "opened") {
        res.status(200).send("");
      } else {
        res.status(200).json({ response_type: "ephemeral", text: "This Canvas repair control is not available here." });
      }
    } catch {
      res.status(200).json({ response_type: "ephemeral", text: "The Canvas repair picker could not be opened. Contact admin before retrying." });
    }
    return;
  }

  const submission = parseCanvasRepairSubmission(payloadText);
  if (submission) {
    res.status(200).json({ response_action: "clear" });
    void (async () => {
      try {
        const result = await repairOneProductionCanvas(submission);
        await postCanvasRepairResult({ ...submission, result });
      } catch {
        await postCanvasRepairResult({ ...submission, result: "not_allowed" }).catch(() => undefined);
      }
    })();
    return;
  }

  const input = parseKeepOpenInteraction(payloadText);
  if (!input) {
    res.status(200).json({ response_type: "ephemeral", text: "This Super Admin action is not available." });
    return;
  }

  // Slack requires an acknowledgment within three seconds. The action itself
  // rechecks the saved private channel, bot message, pending schedule, and
  // one-click claim before cancelling anything.
  res.status(200).json({ response_type: "ephemeral", text: "Checking this campaign archive now." });
  void keepOneCampaignChannelOpen(input).catch(() => undefined);
});

export { superAdminSlackInteractionRouter };
