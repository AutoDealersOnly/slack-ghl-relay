import { deleteHeartbeatJob } from "../_core/heartbeat";
import { updateCampaignArchive } from "./db";

/** Cancels only the two scheduled jobs belonging to one already identified campaign. */
export async function cancelScheduledCampaignArchive(campaign: {
  id: number;
  archiveTaskUid: string | null;
  warningTaskUid: string | null;
}): Promise<void> {
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
