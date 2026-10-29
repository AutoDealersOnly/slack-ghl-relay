import { createHeartbeatJob, deleteHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { cancelScheduledCampaignArchive } from "./archive-jobs";
import {
  attachMailpieceImageJobTask,
  claimMailpieceImageJobForBackstopRecovery,
  claimMailpieceImageJobForScheduling,
  failMailpieceImageJobScheduling,
  getCampaignByChannelName,
  getMailpieceImageBackstopJob,
  isCampaignAutoarchiveEnabled,
  listMailpieceImageBackstopCandidates,
  listPendingCampaignArchives,
  logRelayAction,
  saveMailpieceImageBackstopJob,
  updateCampaignArchive,
} from "./db";
import { redactErrorDetail } from "./security";

const ARCHIVE_TIME_ZONE = "America/New_York";
export const MAILPIECE_IMAGE_BACKSTOP_CRON = "0 */15 * * * *";
export const MAILPIECE_IMAGE_MINIMUM_LEAD_MS = 5 * 60 * 1000;

const easternWeekday = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: ARCHIVE_TIME_ZONE, weekday: "short" }).format(date);

export const isEasternWeekend = (date = new Date()): boolean => {
  const weekday = easternWeekday(date);
  return weekday === "Sat" || weekday === "Sun";
};

const isEasternMonday = (date: Date): boolean => easternWeekday(date) === "Mon";

/** Moves a planned timestamp forward only when its Eastern calendar day is Saturday or Sunday. */
export const moveToNextEasternBusinessDay = (date: Date): Date => {
  const next = new Date(date);
  while (isEasternWeekend(next)) next.setUTCDate(next.getUTCDate() + 1);
  return next;
};

export const calculateArchiveDate = (eventEndDate: string): Date | null => {
  const [year, month, day] = eventEndDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day + 3, 12, 0, 0));
  return Number.isNaN(candidate.getTime()) ? null : moveToNextEasternBusinessDay(candidate);
};

/** A Monday archive receives its warning on Friday, so no warning is sent on a weekend. */
export const calculateArchiveWarningDate = (archiveAfter: Date): Date => {
  const warningDate = new Date(archiveAfter);
  warningDate.setUTCDate(warningDate.getUTCDate() - (isEasternMonday(archiveAfter) ? 3 : 1));
  return warningDate;
};

export const buildExactDateCron = (date: Date): string =>
  `0 0 ${date.getUTCHours()} ${date.getUTCDate()} ${date.getUTCMonth() + 1} *`;

/** Exact one-time minute schedule for prompt work; archive jobs intentionally use whole-hour timing. */
export const buildExactMinuteDateCron = (date: Date): string =>
  `0 ${date.getUTCMinutes()} ${date.getUTCHours()} ${date.getUTCDate()} ${date.getUTCMonth() + 1} *`;

/**
 * Schedules on a future full minute with enough time for the platform to
 * persist and provision the one-time callback. A short one- or two-minute
 * lead can be accepted but missed, after which an exact-date cron rolls to
 * the following year.
 */
export const calculateMailpieceJobRunAt = (now = new Date()): Date => {
  const earliestRunAt = now.getTime() + MAILPIECE_IMAGE_MINIMUM_LEAD_MS;
  return new Date(Math.ceil(earliestRunAt / 60_000) * 60_000);
};

async function scheduleClaimedMailpieceImageJob(input: {
  jobId: number;
  campaignId: number;
  channelName: string;
  priorTaskUid: string | null;
  description: string;
}): Promise<void> {
  try {
    if (input.priorTaskUid) await deleteHeartbeatJob(input.priorTaskUid, "").catch(() => undefined);
    const runAt = calculateMailpieceJobRunAt();
    const scheduled = await createHeartbeatJob(
      {
        name: `relay-mailpiece-images-${input.jobId}`,
        cron: buildExactMinuteDateCron(runAt),
        path: "/api/scheduled/relay/mailpiece-images",
        method: "POST",
        description: `Process BDC mailpiece images for #${input.channelName}.`,
      },
      ""
    );
    const attached = await attachMailpieceImageJobTask({ jobId: input.jobId, taskUid: scheduled.taskUid, scheduledFor: runAt });
    if (!attached) {
      await deleteHeartbeatJob(scheduled.taskUid, "").catch(() => undefined);
      throw new Error("Durable BDC mailpiece image job could not be attached to its scheduling record");
    }
    await logRelayAction({
      campaignId: input.campaignId,
      action: "bdc_mailpiece_image_job",
      outcome: "success",
      detail: input.description,
    });
  } catch (error) {
    const detail = redactErrorDetail(error);
    await failMailpieceImageJobScheduling({ jobId: input.jobId, detail });
    await logRelayAction({
      campaignId: input.campaignId,
      action: "bdc_mailpiece_image_job",
      outcome: "failed",
      detail: `BDC mailpiece image job could not be scheduled: ${detail}`,
    });
    throw error;
  }
}

/** Creates the one project-level recovery heartbeat for recent missed image-worker callbacks. */
export async function ensureMailpieceImageBackstopSchedule(): Promise<"existing" | "created"> {
  const existing = await getMailpieceImageBackstopJob();
  if (existing?.taskUid && existing.isEnabled) return "existing";
  const scheduled = await createHeartbeatJob({
    name: "relay-mailpiece-image-backstop",
    cron: MAILPIECE_IMAGE_BACKSTOP_CRON,
    path: "/api/scheduled/relay/mailpiece-image-backstop",
    method: "POST",
    description: "Recovery check for recent BDC mailpiece image workers that never started.",
  }, "");
  await saveMailpieceImageBackstopJob({ taskUid: scheduled.taskUid, cronExpression: MAILPIECE_IMAGE_BACKSTOP_CRON, isEnabled: true });
  return "created";
}

/**
 * Requeues only recent workers that were already durably created but never
 * started. Completed jobs, historical jobs, and jobs that reached an upload
 * attempt are excluded.
 */
export async function recoverOverdueMailpieceImageJobs(): Promise<{ reviewed: number; rescheduled: number; skipped: number; failed: number }> {
  const candidates = await listMailpieceImageBackstopCandidates();
  const summary = { reviewed: candidates.length, rescheduled: 0, skipped: 0, failed: 0 };
  for (const candidate of candidates) {
    const claimed = await claimMailpieceImageJobForBackstopRecovery({ candidate });
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }
    try {
      await scheduleClaimedMailpieceImageJob({
        jobId: candidate.jobId,
        campaignId: candidate.campaignId,
        channelName: candidate.channelName,
        priorTaskUid: candidate.taskUid,
        description: "Recovery backstop rescheduled a recent BDC mailpiece image worker that never started.",
      });
      summary.rescheduled += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}

/**
 * Queues the long-running BDC work separately from the GoHighLevel webhook.
 * The scheduled callback receives no campaign ID; it derives the job solely
 * from its authenticated platform task identity.
 */
export async function enqueueCampaignMailpieceImageJob(
  campaign: { id: number; channelName: string; requeueCompleted?: boolean }
): Promise<"scheduled" | "already_queued" | "already_completed"> {
  const claim = await claimMailpieceImageJobForScheduling(campaign.id, { requeueCompleted: campaign.requeueCompleted });
  if (!claim.shouldSchedule) {
    const outcome = claim.job.status === "completed" ? "already_completed" : "already_queued";
    await logRelayAction({
      campaignId: campaign.id,
      action: "bdc_mailpiece_image_job",
      outcome: "skipped",
      detail: outcome === "already_completed" ? "A completed BDC mailpiece job already exists for this campaign." : "A BDC mailpiece job is already queued or processing for this campaign.",
    });
    return outcome;
  }

  await scheduleClaimedMailpieceImageJob({
    jobId: claim.job.id,
    campaignId: campaign.id,
    channelName: campaign.channelName,
    priorTaskUid: claim.priorTaskUid,
    description: campaign.requeueCompleted
      ? "Durable BDC mailpiece image job was scheduled for a newly accepted Sent-to-Print reprint."
      : "Durable BDC mailpiece image job was scheduled after the Sent-to-Print notice.",
  });
  await ensureMailpieceImageBackstopSchedule().catch(error =>
    logRelayAction({
      campaignId: campaign.id,
      action: "bdc_mailpiece_image_backstop",
      outcome: "failed",
      detail: `Mailpiece backstop registration could not be confirmed: ${redactErrorDetail(error)}`,
    })
  );
  return "scheduled";
}

export const shouldRescheduleArchive = (
  previousEventEndDate: string | null,
  currentEventEndDate: string | null,
  archiveStatus: string
): boolean => archiveStatus !== "archived" && previousEventEndDate !== currentEventEndDate;

export const shouldReconcileArchiveSchedule = (
  previousEventEndDate: string | null,
  currentEventEndDate: string | null,
  archiveStatus: string,
  archiveAfter: Date | string | null
): boolean => {
  if (shouldRescheduleArchive(previousEventEndDate, currentEventEndDate, archiveStatus)) return true;
  if (archiveStatus === "archived") return false;
  const expectedArchiveDate = currentEventEndDate ? calculateArchiveDate(currentEventEndDate) : null;
  if (!expectedArchiveDate) return archiveAfter !== null;
  if (!archiveAfter) return true;
  return new Date(archiveAfter).getTime() !== expectedArchiveDate.getTime();
};

/** A false project-wide switch is an absolute stop for archive work. */
export const isCampaignAutoarchivePaused = (autoarchiveEnabled: boolean): boolean => !autoarchiveEnabled;

const buildArchiveJobDescription = (channelName: string): string =>
  `Archive #${channelName} three calendar days after the campaign end date, moved to Monday when needed to avoid weekend archive activity.`;

const buildArchiveWarningJobDescription = (channelName: string): string =>
  `Warn #${channelName} before its scheduled archive, moved to Friday when the archive will occur Monday.`;

export async function scheduleCampaignArchive(channelName: string): Promise<void> {
  const campaign = await getCampaignByChannelName(channelName);
  if (!campaign?.eventEndDate || !campaign.channelId) return;

  if (isCampaignAutoarchivePaused(await isCampaignAutoarchiveEnabled())) {
    await logRelayAction({
      campaignId: campaign.id,
      action: "campaign_archive_schedule",
      outcome: "skipped",
      detail: "Autoarchive is paused by the administrator; no archive or warning job was created.",
    });
    return;
  }

  await Promise.all([
    campaign.archiveTaskUid ? deleteHeartbeatJob(campaign.archiveTaskUid, "") : Promise.resolve(),
    campaign.warningTaskUid ? deleteHeartbeatJob(campaign.warningTaskUid, "") : Promise.resolve(),
  ]);

  const archiveAfter = calculateArchiveDate(campaign.eventEndDate);
  if (!archiveAfter) throw new Error("Campaign end date is not a valid YYYY-MM-DD value");
  const warningDate = calculateArchiveWarningDate(archiveAfter);

  const archiveJob = await createHeartbeatJob(
    {
      name: `relay-archive-${campaign.id}`,
      cron: buildExactDateCron(archiveAfter),
      path: "/api/scheduled/relay/archive",
      method: "POST",
      description: buildArchiveJobDescription(campaign.channelName),
    },
    ""
  );
  const warningJob = await createHeartbeatJob(
    {
      name: `relay-archive-warning-${campaign.id}`,
      cron: buildExactDateCron(warningDate),
      path: "/api/scheduled/relay/archive-warning",
      method: "POST",
      description: buildArchiveWarningJobDescription(campaign.channelName),
    },
    ""
  );

  await updateCampaignArchive(campaign.id, {
    archiveAfter,
    archiveTaskUid: archiveJob.taskUid,
    warningTaskUid: warningJob.taskUid,
    archiveStatus: "scheduled",
  });
  const { syncSuperAdminPendingArchive } = await import("./super-admin");
  await syncSuperAdminPendingArchive({ ...campaign, archiveAfter, archiveTaskUid: archiveJob.taskUid, warningTaskUid: warningJob.taskUid, archiveStatus: "scheduled" });
}

export async function cancelCampaignArchive(channelName: string): Promise<void> {
  const campaign = await getCampaignByChannelName(channelName);
  if (!campaign) return;
  await cancelScheduledCampaignArchive(campaign);
  const { syncSuperAdminArchiveDashboard } = await import("./super-admin");
  await syncSuperAdminArchiveDashboard();
}

export async function rescheduleCampaignArchive(channelName: string): Promise<void> {
  await cancelCampaignArchive(channelName);
  await scheduleCampaignArchive(channelName);
}

/**
 * Updates only existing pending archive and warning jobs to the weekend-safe
 * dates. It never archives a channel, changes Production data, or creates a
 * schedule for a campaign that was not already pending.
 */
export async function applyWeekendArchivePolicyToPendingCampaigns(): Promise<{
  reviewed: number;
  updated: number;
  unchanged: number;
  failed: number;
}> {
  const campaigns = await listPendingCampaignArchives();
  const summary = { reviewed: campaigns.length, updated: 0, unchanged: 0, failed: 0 };

  for (const campaign of campaigns) {
    const archiveAfter = campaign.eventEndDate ? calculateArchiveDate(campaign.eventEndDate) : null;
    if (!archiveAfter || !campaign.archiveTaskUid) {
      summary.unchanged += 1;
      continue;
    }

    const warningDate = calculateArchiveWarningDate(archiveAfter);
    const archiveAlreadyMatches = campaign.archiveAfter && new Date(campaign.archiveAfter).getTime() === archiveAfter.getTime();
    const warningAlreadyPassed = !campaign.warningTaskUid;
    if (archiveAlreadyMatches && warningAlreadyPassed) {
      summary.unchanged += 1;
      continue;
    }

    try {
      await updateHeartbeatJob(campaign.archiveTaskUid, {
        cron: buildExactDateCron(archiveAfter),
        description: buildArchiveJobDescription(campaign.channelName),
      }, "");
      if (campaign.warningTaskUid) {
        await updateHeartbeatJob(campaign.warningTaskUid, {
          cron: buildExactDateCron(warningDate),
          description: buildArchiveWarningJobDescription(campaign.channelName),
        }, "");
      }
      await updateCampaignArchive(campaign.id, { archiveAfter });
      summary.updated += 1;
    } catch (error) {
      summary.failed += 1;
      await logRelayAction({
        campaignId: campaign.id,
        action: "campaign_archive_weekend_policy",
        outcome: "failed",
        detail: redactErrorDetail(error),
      }).catch(() => undefined);
    }
  }

  const { syncSuperAdminArchiveDashboard } = await import("./super-admin");
  await syncSuperAdminArchiveDashboard().catch(() => undefined);
  return summary;
}
