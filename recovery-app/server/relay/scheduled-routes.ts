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
  getActivityDashboardRefreshJobByTaskUid,
  getCampaignByScheduledTask,
  isCampaignAutoarchiveEnabled,
  getMailpieceImageBackstopJobByTaskUid,
  getMailpieceImageJobByTaskUid,
  logRelayAction,
  recordArchiveReconciliationRun,
  recordActivityDashboardRefreshRun,
  recordMailpieceImageBackstopRun,
  touchMailpieceImageJobRun,
  updateCampaignArchive,
} from "./db";
import { reconcileActiveCampaignArchiveRegistrations } from "./archive-reconciliation";
import { redactErrorDetail } from "./security";
import { archiveCampaignChannel } from "./workflows";
import { postSlackMessage } from "./slack";
import { uploadCampaignMailpieceImages } from "./mailpiece-images";
import { fetchProductionRecord } from "./ghl";
import { markSuperAdminArchiveCompleted } from "./super-admin";
import { refreshOpenActivityDashboards } from "./activity-dashboard";
import { isEasternWeekend, recoverOverdueMailpieceImageJobs } from "./scheduling";

const scheduledRelayRouter = Router();
export const ARCHIVE_WARNING_MESSAGE = "This channel is scheduled to archive tomorrow. Contact admin if the campaign needs to remain open.";
export const MONDAY_ARCHIVE_WARNING_MESSAGE = "This channel is scheduled to archive on Monday. Contact admin if the campaign needs to remain open.";
export const buildRelayKeepaliveResponse = () => ({ ok: true, service: "relay" });

export const getArchiveWarningMessage = (archiveAfter: Date | string | null): string => {
  const date = archiveAfter ? new Date(archiveAfter) : null;
  return date && !Number.isNaN(date.getTime()) && new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(date) === "Mon"
    ? MONDAY_ARCHIVE_WARNING_MESSAGE
    : ARCHIVE_WARNING_MESSAGE;
};

export function isAuthenticatedCronTask(user: { isCron?: boolean; taskUid?: string | null }): user is { isCron: true; taskUid: string } {
  return user.isCron === true && typeof user.taskUid === "string" && user.taskUid.length > 0;
}

type ClaimedMailpieceImageJob = NonNullable<Awaited<ReturnType<typeof getMailpieceImageJobByTaskUid>>>;

export type ClaimedMailpieceImageJobDependencies = {
  getCampaign: typeof getCampaignById;
  fetchProduction: typeof fetchProductionRecord;
  uploadImages: typeof uploadCampaignMailpieceImages;
  completeJob: typeof completeMailpieceImageJob;
  deleteTask: typeof deleteHeartbeatJob;
  logAction: typeof logRelayAction;
  touchJob: typeof touchMailpieceImageJobRun;
  failJob: typeof failMailpieceImageJobRun;
};

const claimedMailpieceImageJobDependencies: ClaimedMailpieceImageJobDependencies = {
  getCampaign: getCampaignById,
  fetchProduction: fetchProductionRecord,
  uploadImages: uploadCampaignMailpieceImages,
  completeJob: completeMailpieceImageJob,
  deleteTask: deleteHeartbeatJob,
  logAction: logRelayAction,
  touchJob: touchMailpieceImageJobRun,
  failJob: failMailpieceImageJobRun,
};

/**
 * The scheduler has a short callback deadline, while a two-page Media Library
 * upload can legitimately take longer. This work starts only after the task
 * has been durably claimed and the scheduler has received its acknowledgement.
 */
export async function processClaimedMailpieceImageJob(
  input: { taskUid: string; job: ClaimedMailpieceImageJob },
  dependencies: ClaimedMailpieceImageJobDependencies = claimedMailpieceImageJobDependencies
): Promise<void> {
  const campaignId = input.job.campaignId;
  try {
    const campaign = await dependencies.getCampaign(input.job.campaignId);
    if (!campaign) {
      await dependencies.completeJob({ taskUid: input.taskUid });
      return;
    }
    const production = await dependencies.fetchProduction(campaign.channelName);
    if (!production) throw new Error("No current ADO Production record matched the scheduled mailpiece campaign");

    await dependencies.logAction({
      campaignId: campaign.id,
      action: "bdc_mailpiece_image_stage",
      outcome: "success",
      detail: "Current Production record was loaded for the scheduled BDC mailpiece job.",
      attemptCount: input.job.attemptCount,
    });

    await dependencies.uploadImages({
      campaign,
      production,
      onStage: async stage => {
        await dependencies.touchJob(input.taskUid);
        await dependencies.logAction({
          campaignId: campaign.id,
          action: "bdc_mailpiece_image_stage",
          outcome: "success",
          detail: `Scheduled BDC mailpiece job reached stage: ${stage}.`,
          attemptCount: input.job.attemptCount,
        });
      },
    });
    await dependencies.completeJob({ taskUid: input.taskUid });
    await dependencies.deleteTask(input.taskUid, "").catch(() => undefined);
    await dependencies.logAction({
      campaignId: campaign.id,
      action: "bdc_mailpiece_image_job",
      outcome: "success",
      detail: "Durable BDC mailpiece image job completed.",
      attemptCount: input.job.attemptCount,
    });
  } catch (error) {
    const detail = redactErrorDetail(error);
    await dependencies.failJob({ taskUid: input.taskUid, detail }).catch(() => undefined);
    await dependencies.logAction({
      campaignId,
      action: "bdc_mailpiece_image_job",
      outcome: "failed",
      detail: `Durable BDC mailpiece image job failed: ${detail}`,
    }).catch(() => undefined);
  }
}

/** Responds before starting long-running image work so the scheduler cannot cut it off mid-upload. */
export function acknowledgeClaimedMailpieceImageJob(res: Response, work: () => Promise<void>) {
  res.status(202).json({ ok: true, accepted: "mailpiece_image_job" });
  queueMicrotask(() => void work().catch(() => undefined));
}

async function authenticateCron(req: Request, res: Response) {
  const user = await sdk.authenticateRequest(req);
  if (!isAuthenticatedCronTask(user)) {
    res.status(403).json({ error: "cron-only" });
    return null;
  }
  return user;
}

/**
 * A lightweight, authenticated availability check. It keeps the relay ready
 * for Slack's short slash-command response window and performs no business
 * action or third-party API call.
 */
scheduledRelayRouter.post("/keepalive", async (req: Request, res: Response) => {
  const user = await authenticateCron(req, res);
  if (!user) return;
  res.status(200).json(buildRelayKeepaliveResponse());
});

scheduledRelayRouter.post("/archive", async (req: Request, res: Response) => {
  let campaignId: number | null = null;
  try {
    const user = await authenticateCron(req, res);
    if (!user) return;
    if (!(await isCampaignAutoarchiveEnabled())) {
      res.json({ ok: true, skipped: "autoarchive_paused" });
      return;
    }
    if (isEasternWeekend()) {
      res.json({ ok: true, skipped: "weekend_hold" });
      return;
    }
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
    await markSuperAdminArchiveCompleted({ ...campaign, archiveStatus: "scheduled" }).catch(() => undefined);
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
    if (!(await isCampaignAutoarchiveEnabled())) {
      res.json({ ok: true, skipped: "autoarchive_paused" });
      return;
    }
    if (isEasternWeekend()) {
      res.json({ ok: true, skipped: "weekend_hold" });
      return;
    }
    const campaign = await getCampaignByScheduledTask(user.taskUid!, "warning");
    if (!campaign || campaign.archiveStatus !== "scheduled" || !campaign.channelId) {
      res.json({ ok: true, skipped: "orphan_or_completed" });
      return;
    }
    campaignId = campaign.id;
    await postSlackMessage(campaign.channelId, getArchiveWarningMessage(campaign.archiveAfter));
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
    if (isEasternWeekend()) {
      res.json({ ok: true, skipped: "weekend_hold" });
      return;
    }
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

/** Refreshes only saved, still-open ABC Test Activity Dashboard Canvases every fifteen minutes. */
scheduledRelayRouter.post("/activity-dashboard-refresh", async (req: Request, res: Response) => {
  try {
    const user = await authenticateCron(req, res);
    if (!user) return;
    const job = await getActivityDashboardRefreshJobByTaskUid(user.taskUid!);
    if (!job || !job.isEnabled) {
      res.json({ ok: true, skipped: "unknown_or_disabled_activity_dashboard_job" });
      return;
    }
    const summary = await refreshOpenActivityDashboards();
    await recordActivityDashboardRefreshRun(user.taskUid!, JSON.stringify(summary));
    await logRelayAction({
      action: "activity_dashboard_refresh",
      outcome: summary.failed > 0 ? "failed" : "success",
      detail: `Refreshed ${summary.refreshed}; skipped ${summary.skipped}; failed ${summary.failed}.`,
    });
    if (summary.failed > 0) {
      res.status(500).json({ error: "activity dashboard refresh had failures", summary, timestamp: new Date().toISOString() });
      return;
    }
    res.json({ ok: true, summary });
  } catch (error) {
    const detail = redactErrorDetail(error);
    await logRelayAction({ action: "activity_dashboard_refresh", outcome: "failed", detail }).catch(() => undefined);
    res.status(500).json({ error: "activity dashboard refresh failed", detail, timestamp: new Date().toISOString() });
  }
});

/**
 * A guarded recovery-only path for a missed one-time image callback. The
 * database selector accepts only recent jobs that never started and ignores
 * all request-body values.
 */
scheduledRelayRouter.post("/mailpiece-image-backstop", async (req: Request, res: Response) => {
  try {
    const user = await authenticateCron(req, res);
    if (!user) return;
    const job = await getMailpieceImageBackstopJobByTaskUid(user.taskUid!);
    if (!job || !job.isEnabled) {
      res.json({ ok: true, skipped: "unknown_or_disabled_mailpiece_backstop" });
      return;
    }
    const summary = await recoverOverdueMailpieceImageJobs();
    await recordMailpieceImageBackstopRun(user.taskUid!, JSON.stringify(summary));
    await logRelayAction({
      action: "bdc_mailpiece_image_backstop",
      outcome: summary.failed > 0 ? "failed" : "success",
      detail: `Missed-worker backstop reviewed ${summary.reviewed}; rescheduled ${summary.rescheduled}; skipped ${summary.skipped}; failed ${summary.failed}.`,
    });
    if (summary.failed > 0) {
      res.status(500).json({ error: "mailpiece image backstop had failures", summary, timestamp: new Date().toISOString() });
      return;
    }
    res.json({ ok: true, summary });
  } catch (error) {
    const detail = redactErrorDetail(error);
    await logRelayAction({ action: "bdc_mailpiece_image_backstop", outcome: "failed", detail }).catch(() => undefined);
    res.status(500).json({ error: "mailpiece image backstop failed", detail, timestamp: new Date().toISOString() });
  }
});

/**
 * Runs only when invoked by the platform-managed one-time job. The body is
 * deliberately ignored: task ownership is derived exclusively from `taskUid`.
 */
scheduledRelayRouter.post("/mailpiece-images", async (req: Request, res: Response) => {
  try {
    const user = await authenticateCron(req, res);
    if (!user) return;
    const taskUid = user.taskUid!;
    const job = await getMailpieceImageJobByTaskUid(taskUid);
    if (!job) {
      res.json({ ok: true, skipped: "orphan_mailpiece_job" });
      return;
    }
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

    acknowledgeClaimedMailpieceImageJob(res, () => processClaimedMailpieceImageJob({ taskUid, job: claim.job! }));
  } catch (error) {
    const detail = redactErrorDetail(error);
    if (!res.headersSent) res.status(500).json({ error: "mailpiece image job failed", detail, timestamp: new Date().toISOString() });
  }
});

export { scheduledRelayRouter };
