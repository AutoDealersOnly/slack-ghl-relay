import {
  getCampaignByChannelName,
  logRelayAction,
  upsertCampaign,
} from "./db";
import { fetchProductionRecord } from "./ghl";
import { normalizeCampaignChannelName } from "./naming";
import { calculateArchiveDate, scheduleCampaignArchive } from "./scheduling";
import { listActiveCampaignChannels } from "./slack";

type ArchiveStatus = "not_scheduled" | "scheduled" | "cancelled" | "archived" | "failed";

export type ArchiveReconciliationDecision = "schedule" | "manual_catchup" | "skip";

export function decideArchiveReconciliation(input: {
  eventEndDate: string | null;
  archiveStatus: ArchiveStatus;
  hasArchiveTask: boolean;
  now: Date;
}): ArchiveReconciliationDecision {
  const archiveAfter = input.eventEndDate ? calculateArchiveDate(input.eventEndDate) : null;
  if (!archiveAfter || input.archiveStatus === "archived" || input.archiveStatus === "cancelled") return "skip";
  if (archiveAfter.getTime() <= input.now.getTime()) return "manual_catchup";
  if (input.archiveStatus !== "scheduled" || !input.hasArchiveTask) return "schedule";
  return "skip";
}

export type ArchiveReconciliationSummary = {
  inspected: number;
  scheduled: number;
  overdueForApproval: number;
  skipped: number;
  failed: number;
};

const runWithConcurrency = async <T>(items: T[], limit: number, worker: (item: T) => Promise<void>) => {
  let nextIndex = 0;
  const runWorker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
};

/**
 * Re-registers active campaign channels that missed their normal webhook-based setup.
 * It schedules only future archive dates. Already-overdue channels are logged for the
 * separate user-approved catch-up action rather than being archived by reconciliation.
 */
export async function reconcileActiveCampaignArchiveRegistrations(now = new Date()): Promise<ArchiveReconciliationSummary> {
  const summary: ArchiveReconciliationSummary = { inspected: 0, scheduled: 0, overdueForApproval: 0, skipped: 0, failed: 0 };
  const channels = await listActiveCampaignChannels();

  await runWithConcurrency(channels, 4, async channel => {
    summary.inspected += 1;
    let campaignId: number | null = null;
    try {
      const existing = await getCampaignByChannelName(channel.name);
      const production = await fetchProductionRecord(channel.name);
      const productionName = production?.properties.production?.trim() ?? "";
      if (!production || normalizeCampaignChannelName(productionName) !== channel.name) {
        summary.skipped += 1;
        await logRelayAction({
          campaignId: existing?.id ?? null,
          action: "campaign_archive_reconciliation",
          outcome: "skipped",
          detail: "No exact current Production record matched this active campaign channel.",
        });
        return;
      }

      const campaign = await upsertCampaign({
        productionName,
        channelName: channel.name,
        channelId: channel.id,
        canvasId: existing?.canvasId ?? null,
        dealershipRecordId: existing?.dealershipRecordId ?? null,
        dealershipName: existing?.dealershipName ?? null,
        eventEndDate: production.properties.event_end ?? null,
      });
      campaignId = campaign.id;

      const decision = decideArchiveReconciliation({
        eventEndDate: campaign.eventEndDate,
        archiveStatus: campaign.archiveStatus,
        hasArchiveTask: Boolean(campaign.archiveTaskUid),
        now,
      });
      if (decision === "schedule") {
        await scheduleCampaignArchive(campaign.channelName);
        summary.scheduled += 1;
        await logRelayAction({
          campaignId: campaign.id,
          action: "campaign_archive_reconciliation",
          outcome: "success",
          detail: "Missing future archive registration restored.",
        });
        return;
      }
      if (decision === "manual_catchup") {
        summary.overdueForApproval += 1;
        await logRelayAction({
          campaignId: campaign.id,
          action: "campaign_archive_reconciliation",
          outcome: "skipped",
          detail: "Overdue campaign registration recorded for the user-approved catch-up list.",
        });
        return;
      }

      summary.skipped += 1;
    } catch (error) {
      summary.failed += 1;
      await logRelayAction({
        campaignId,
        action: "campaign_archive_reconciliation",
        outcome: "failed",
        detail: String(error),
      }).catch(() => undefined);
    }
  });

  return summary;
}
