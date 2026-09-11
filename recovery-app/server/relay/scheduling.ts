import { createHeartbeatJob, deleteHeartbeatJob } from "../_core/heartbeat";
import {
  attachMailpieceImageJobTask,
  claimMailpieceImageJobForScheduling,
  failMailpieceImageJobScheduling,
  getCampaignByChannelName,
  logRelayAction,
  updateCampaignArchive,
} from "./db";
import { redactErrorDetail } from "./security";

export const calculateArchiveDate = (eventEndDate: string): Date | null => {
  const [year, month, day] = eventEndDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day + 3, 12, 0, 0));
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

export const buildExactDateCron = (date: Date): string =>
  `0 0 ${date.getUTCHours()} ${date.getUTCDate()} ${date.getUTCMonth() + 1} *`;

/** Exact one-time minute schedule for prompt work; archive jobs intentionally use whole-hour timing. */
export const buildExactMinuteDateCron = (date: Date): string =>
  `0 ${date.getUTCMinutes()} ${date.getUTCHours()} ${date.getUTCDate()} ${date.getUTCMonth() + 1} *`;

/** Schedules the callback on a future full minute so platform registration has time to complete. */
export const calculateMailpieceJobRunAt = (now = new Date()): Date => {
  const runAt = new Date(now);
  runAt.setUTCSeconds(0, 0);
  runAt.setUTCMinutes(runAt.getUTCMinutes() + 2);
  return runAt;
};

/**
 * Queues the long-running BDC work separately from the GoHighLevel webhook.
 * The scheduled callback receives no campaign ID; it derives the job solely
 * from its authenticated platform task identity.
 */
export async function enqueueCampaignMailpieceImageJob(campaign: { id: number; channelName: string }): Promise<"scheduled" | "already_queued" | "already_completed"> {
  const claim = await claimMailpieceImageJobForScheduling(campaign.id);
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

  try {
    if (claim.priorTaskUid) await deleteHeartbeatJob(claim.priorTaskUid, "").catch(() => undefined);
    const runAt = calculateMailpieceJobRunAt();
    const scheduled = await createHeartbeatJob(
      {
        name: `relay-mailpiece-images-${claim.job.id}`,
        cron: buildExactMinuteDateCron(runAt),
        path: "/api/scheduled/relay/mailpiece-images",
        method: "POST",
        description: `Process BDC mailpiece images for #${campaign.channelName}.`,
      },
      ""
    );
    const attached = await attachMailpieceImageJobTask({ jobId: claim.job.id, taskUid: scheduled.taskUid, scheduledFor: runAt });
    if (!attached) {
      await deleteHeartbeatJob(scheduled.taskUid, "").catch(() => undefined);
      throw new Error("Durable BDC mailpiece image job could not be attached to its scheduling record");
    }
    await logRelayAction({
      campaignId: campaign.id,
      action: "bdc_mailpiece_image_job",
      outcome: "success",
      detail: "Durable BDC mailpiece image job was scheduled after the Sent-to-Print notice.",
    });
    return "scheduled";
  } catch (error) {
    const detail = redactErrorDetail(error);
    await failMailpieceImageJobScheduling({ jobId: claim.job.id, detail });
    await logRelayAction({
      campaignId: campaign.id,
      action: "bdc_mailpiece_image_job",
      outcome: "failed",
      detail: `BDC mailpiece image job could not be scheduled: ${detail}`,
    });
    throw error;
  }
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

export async function scheduleCampaignArchive(channelName: string): Promise<void> {
  const campaign = await getCampaignByChannelName(channelName);
  if (!campaign?.eventEndDate || !campaign.channelId) return;

  await Promise.all([
    campaign.archiveTaskUid ? deleteHeartbeatJob(campaign.archiveTaskUid, "") : Promise.resolve(),
    campaign.warningTaskUid ? deleteHeartbeatJob(campaign.warningTaskUid, "") : Promise.resolve(),
  ]);

  const archiveAfter = calculateArchiveDate(campaign.eventEndDate);
  if (!archiveAfter) throw new Error("Campaign end date is not a valid YYYY-MM-DD value");
  const warningDate = new Date(archiveAfter);
  warningDate.setUTCDate(warningDate.getUTCDate() - 1);

  const archiveJob = await createHeartbeatJob(
    {
      name: `relay-archive-${campaign.id}`,
      cron: buildExactDateCron(archiveAfter),
      path: "/api/scheduled/relay/archive",
      method: "POST",
      description: `Archive #${campaign.channelName} three days after the campaign end date.`,
    },
    ""
  );
  const warningJob = await createHeartbeatJob(
    {
      name: `relay-archive-warning-${campaign.id}`,
      cron: buildExactDateCron(warningDate),
      path: "/api/scheduled/relay/archive-warning",
      method: "POST",
      description: `Warn #${campaign.channelName} one day before its scheduled archive.`,
    },
    ""
  );

  await updateCampaignArchive(campaign.id, {
    archiveAfter,
    archiveTaskUid: archiveJob.taskUid,
    warningTaskUid: warningJob.taskUid,
    archiveStatus: "scheduled",
  });
}

export async function cancelCampaignArchive(channelName: string): Promise<void> {
  const campaign = await getCampaignByChannelName(channelName);
  if (!campaign) return;
  await Promise.all([
    campaign.archiveTaskUid ? deleteHeartbeatJob(campaign.archiveTaskUid, "") : Promise.resolve(),
    campaign.warningTaskUid ? deleteHeartbeatJob(campaign.warningTaskUid, "") : Promise.resolve(),
  ]);
  await updateCampaignArchive(campaign.id, {
    archiveTaskUid: null,
    warningTaskUid: null,
    archiveAfter: null,
    archiveStatus: "cancelled",
  });
}

export async function rescheduleCampaignArchive(channelName: string): Promise<void> {
  await cancelCampaignArchive(channelName);
  await scheduleCampaignArchive(channelName);
}
