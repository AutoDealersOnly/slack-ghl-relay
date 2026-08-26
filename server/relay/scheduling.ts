import { createHeartbeatJob, deleteHeartbeatJob } from "../_core/heartbeat";
import { getCampaignByChannelName, updateCampaignArchive } from "./db";

export const calculateArchiveDate = (eventEndDate: string): Date | null => {
  const [year, month, day] = eventEndDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day + 3, 12, 0, 0));
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

export const buildExactDateCron = (date: Date): string =>
  `0 0 ${date.getUTCHours()} ${date.getUTCDate()} ${date.getUTCMonth() + 1} *`;

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
