import type { Request, Response } from "express";
import { Router } from "express";
import { getRelayConfig } from "./config";
import { keepOneCampaignChannelOpen, SUPER_ADMIN_KEEP_OPEN_ACTION } from "./super-admin";
import { isAuthorizedSlackRequest } from "./security";

type SlackInteractionRequest = Request & { rawBody?: string };
type SlackBlockAction = { action_id?: string; value?: string };
type SlackInteractionPayload = {
  type?: string;
  channel?: { id?: string };
  message?: { ts?: string };
  actions?: SlackBlockAction[];
};

export type KeepOpenInteraction = { superAdminChannelId: string; campaignId: number; messageTs: string };

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

const superAdminSlackInteractionRouter = Router();

superAdminSlackInteractionRouter.post("/", (req: SlackInteractionRequest, res: Response) => {
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

  const input = parseKeepOpenInteraction((req.body as { payload?: unknown }).payload);
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
