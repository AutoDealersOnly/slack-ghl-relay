import type { Request, Response } from "express";
import { Router } from "express";
import { sdk } from "../_core/sdk";
import { deleteHeartbeatJob } from "../_core/heartbeat";
import {
  claimMailpieceImageJobRun,
  completeMailpieceImageJob,
  failMailpieceImageJobRun,
  getCampaignById,
  getArchiveReconciliationJobByTaskUid,
  getCampaignByScheduledTask,
  getMailpieceImageJobByTaskUid,
  logRelayAction,
  recordArchiveReconciliationRun,
  updateCampaignArchive,
} from "./db";
import { reconcileActiveCampaignArchiveRegistrations } from "./archive-reconciliation";
import { redactErrorDetail } from "./security";
import { archiveCampaignChannel } from "./workflows";
import { postSlackMessage } from "./slack";
import { uploadCampaignMailpieceImages } from "./mailpiece-images";
import { fetchProductionRecord } from "./ghl";

const scheduledRelayRouter = Router();

export function isAuthenticatedCronTask(user: { isCron?: boolean; taskUid?: string | null }): user is { isCron: true; taskUid: string } {
  return user.isCron === true && typeof user.taskUid === "string" && user.taskUid.length > 0;
}

async function authenticateCron(req: Request, res: Response) {
  const user = await sdk.authenticateRequest(req);
  if (!isAuthenticatedCronTask(user)) {
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

/**
 * Runs only when invoked by the platform-managed one-time job. The body is
 * deliberately ignored: task ownership is derived exclusively from `taskUid`.
 */
scheduledRelayRouter.post("/mailpiece-images", async (req: Request, res: Response) => {
  let taskUid: string | null = null;
  let campaignId: number | null = null;
  try {
    const user = await authenticateCron(req, res);
    if (!user) return;
    taskUid = user.taskUid!;
    const job = await getMailpieceImageJobByTaskUid(taskUid);
    if (!job) {
      res.json({ ok: true, skipped: "orphan_mailpiece_job" });
      return;
    }
    campaignId = job.campaignId;
    const claim = await claimMailpieceImageJobRun(taskUid);
    if (!claim.claimed || !claim.job) {
      res.json({ ok: true, skipped: "completed_or_in_progress_mailpiece_job" });
      return;
    }

    await logRelayAction({
      campaignId: claim.job.campaignId,
      action: "bdc_mailpiece_image_stage",
      outcome: "success",
      detail: "Scheduled BDC mailpiece job claimed by the authenticated callback.",
      attemptCount: claim.job.attemptCount,
    });

    const campaign = await getCampaignById(claim.job.campaignId);
    if (!campaign) {
      await completeMailpieceImageJob({ taskUid });
      res.json({ ok: true, skipped: "orphan_campaign" });
      return;
    }
    const production = await fetchProductionRecord(campaign.channelName);
    if (!production) throw new Error("No current ADO Production record matched the scheduled mailpiece campaign");

    await logRelayAction({
      campaignId: campaign.id,
      action: "bdc_mailpiece_image_stage",
      outcome: "success",
      detail: "Current Production record was loaded for the scheduled BDC mailpiece job.",
      attemptCount: claim.job.attemptCount,
    });

    await uploadCampaignMailpieceImages({
      campaign,
      production,
      onStage: stage =>
        logRelayAction({
          campaignId: campaign.id,
          action: "bdc_mailpiece_image_stage",
          outcome: "success",
          detail: `Scheduled BDC mailpiece job reached stage: ${stage}.`,
          attemptCount: claim.job!.attemptCount,
        }),
    });
    await completeMailpieceImageJob({ taskUid });
    await deleteHeartbeatJob(taskUid, "").catch(() => undefined);
    await logRelayAction({
      campaignId: campaign.id,
      action: "bdc_mailpiece_image_job",
      outcome: "success",
      detail: "Durable BDC mailpiece image job completed.",
      attemptCount: claim.job.attemptCount,
    });
    res.json({ ok: true, campaign: campaign.channelName });
  } catch (error) {
    const detail = redactErrorDetail(error);
    if (taskUid) await failMailpieceImageJobRun({ taskUid, detail }).catch(() => undefined);
    if (campaignId !== null) {
      await logRelayAction({
        campaignId,
        action: "bdc_mailpiece_image_job",
        outcome: "failed",
        detail: `Durable BDC mailpiece image job failed: ${detail}`,
      }).catch(() => undefined);
    }
    res.status(500).json({ error: "mailpiece image job failed", detail, context: { taskUid }, timestamp: new Date().toISOString() });
  }
});

export { scheduledRelayRouter };
