import type { Request, Response } from "express";
import { Router } from "express";
import { sdk } from "../_core/sdk";
import { deleteHeartbeatJob } from "../_core/heartbeat";
import {
  getArchiveReconciliationJobByTaskUid,
  getCampaignByScheduledTask,
  logRelayAction,
  recordArchiveReconciliationRun,
  updateCampaignArchive,
} from "./db";
import { reconcileActiveCampaignArchiveRegistrations } from "./archive-reconciliation";
import { redactErrorDetail } from "./security";
import { archiveCampaignChannel } from "./workflows";
import { postSlackMessage } from "./slack";

const scheduledRelayRouter = Router();

async function authenticateCron(req: Request, res: Response) {
  const user = await sdk.authenticateRequest(req);
  if (!user.isCron || !user.taskUid) {
    res.status(403).json({ error: "cron-only" });
    return null;
  }
  return user;
}

scheduledRelayRouter.post("/archive", async (req: Request, res: Response) => {
  let campaignId: number | null = null;
  try {
    const user = await authenticateCron(req, res);
    if (!user) return;
    const campaign = await getCampaignByScheduledTask(user.taskUid!, "archive");
    if (!campaign || campaign.archiveStatus === "archived" || campaign.archiveStatus === "cancelled") {
      res.json({ ok: true, skipped: "orphan_or_completed" });
      return;
    }
    campaignId = campaign.id;
    await archiveCampaignChannel(campaign);
    await updateCampaignArchive(campaign.id, { archiveStatus: "archived", archiveTaskUid: null, warningTaskUid: null });
    if (campaign.archiveTaskUid) await deleteHeartbeatJob(campaign.archiveTaskUid, "").catch(() => undefined);
    if (campaign.warningTaskUid) await deleteHeartbeatJob(campaign.warningTaskUid, "").catch(() => undefined);
    res.json({ ok: true, campaign: campaign.channelName });
  } catch (error) {
    const detail = redactErrorDetail(error);
    if (campaignId !== null) {
      await updateCampaignArchive(campaignId, { archiveStatus: "failed" }).catch(() => undefined);
      await logRelayAction({ campaignId, action: "campaign_channel_archive", outcome: "failed", detail }).catch(() => undefined);
    }
    res.status(500).json({ error: "archive failed", detail, timestamp: new Date().toISOString() });
  }
});

scheduledRelayRouter.post("/archive-warning", async (req: Request, res: Response) => {
  let campaignId: number | null = null;
  try {
    const user = await authenticateCron(req, res);
    if (!user) return;
    const campaign = await getCampaignByScheduledTask(user.taskUid!, "warning");
    if (!campaign || campaign.archiveStatus !== "scheduled" || !campaign.channelId) {
      res.json({ ok: true, skipped: "orphan_or_completed" });
      return;
    }
    campaignId = campaign.id;
    await postSlackMessage(campaign.channelId, "This channel is scheduled to archive tomorrow. Reply in the operations channel if the campaign needs to remain open.");
    await logRelayAction({ campaignId: campaign.id, action: "campaign_archive_warning", outcome: "success", detail: "Archive warning posted to campaign channel." });
    await updateCampaignArchive(campaign.id, { warningTaskUid: null });
    if (campaign.warningTaskUid) await deleteHeartbeatJob(campaign.warningTaskUid, "").catch(() => undefined);
    res.json({ ok: true, campaign: campaign.channelName });
  } catch (error) {
    const detail = redactErrorDetail(error);
    if (campaignId !== null) {
      await logRelayAction({ campaignId, action: "campaign_archive_warning", outcome: "failed", detail }).catch(() => undefined);
    }
    res.status(500).json({ error: "archive warning failed", detail, timestamp: new Date().toISOString() });
  }
});

scheduledRelayRouter.post("/archive-reconcile", async (req: Request, res: Response) => {
  try {
    const user = await authenticateCron(req, res);
    if (!user) return;
    const job = await getArchiveReconciliationJobByTaskUid(user.taskUid!);
    if (!job || !job.isEnabled) {
      res.json({ ok: true, skipped: "unknown_or_disabled_reconciliation_job" });
      return;
    }
    const summary = await reconcileActiveCampaignArchiveRegistrations();
    await recordArchiveReconciliationRun(user.taskUid!, JSON.stringify(summary));
    await logRelayAction({
      action: "campaign_archive_reconciliation",
      outcome: summary.failed > 0 ? "failed" : "success",
      detail: `Inspected ${summary.inspected}; scheduled ${summary.scheduled}; overdue for approval ${summary.overdueForApproval}; skipped ${summary.skipped}; failed ${summary.failed}.`,
    });
    if (summary.failed > 0) {
      res.status(500).json({ error: "archive reconciliation had failures", summary, timestamp: new Date().toISOString() });
      return;
    }
    res.json({ ok: true, summary });
  } catch (error) {
    const detail = redactErrorDetail(error);
    res.status(500).json({ error: "archive reconciliation failed", detail, timestamp: new Date().toISOString() });
  }
});

export { scheduledRelayRouter };
