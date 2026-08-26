import { desc, eq } from "drizzle-orm";
import { relayActionLogs, relayCampaigns, relaySettingsMetadata, relayWebhookReceipts } from "../../drizzle/schema";
import { getDb } from "../db";

export type CampaignUpsertInput = {
  productionName: string;
  channelName: string;
  channelId?: string | null;
  canvasId?: string | null;
  dealershipRecordId?: string | null;
  dealershipName?: string | null;
  eventEndDate?: string | null;
};

export async function getCampaignByChannelName(channelName: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(relayCampaigns).where(eq(relayCampaigns.channelName, channelName)).limit(1);
  return rows[0] ?? null;
}

export async function getCampaignByScheduledTask(taskUid: string, kind: "archive" | "warning") {
  const db = await getDb();
  if (!db) return null;
  const column = kind === "archive" ? relayCampaigns.archiveTaskUid : relayCampaigns.warningTaskUid;
  const rows = await db.select().from(relayCampaigns).where(eq(column, taskUid)).limit(1);
  return rows[0] ?? null;
}

export async function upsertCampaign(input: CampaignUpsertInput) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");

  await db
    .insert(relayCampaigns)
    .values({
      productionName: input.productionName,
      channelName: input.channelName,
      channelId: input.channelId ?? null,
      canvasId: input.canvasId ?? null,
      dealershipRecordId: input.dealershipRecordId ?? null,
      dealershipName: input.dealershipName ?? null,
      eventEndDate: input.eventEndDate ?? null,
    })
    .onDuplicateKeyUpdate({
      set: {
        productionName: input.productionName,
        channelId: input.channelId ?? null,
        canvasId: input.canvasId ?? null,
        dealershipRecordId: input.dealershipRecordId ?? null,
        dealershipName: input.dealershipName ?? null,
        eventEndDate: input.eventEndDate ?? null,
      },
    });

  const campaign = await getCampaignByChannelName(input.channelName);
  if (!campaign) throw new Error("Relay campaign was not found after saving");
  return campaign;
}

export async function updateCampaignArchive(
  campaignId: number,
  patch: {
    archiveAfter?: Date | null;
    archiveTaskUid?: string | null;
    warningTaskUid?: string | null;
    archiveStatus?: "not_scheduled" | "scheduled" | "cancelled" | "archived" | "failed";
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db.update(relayCampaigns).set(patch).where(eq(relayCampaigns.id, campaignId));
}

export async function createWebhookReceipt(input: {
  deliveryKey: string;
  eventType: string;
  payloadHash: string;
}): Promise<{ accepted: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");

  try {
    await db.insert(relayWebhookReceipts).values(input);
    return { accepted: true };
  } catch (error) {
    if (String(error).includes("Duplicate entry")) return { accepted: false };
    throw error;
  }
}

export async function finishWebhookReceipt(deliveryKey: string, outcome: "processed" | "failed") {
  const db = await getDb();
  if (!db) return;
  await db
    .update(relayWebhookReceipts)
    .set({ outcome, processedAt: new Date() })
    .where(eq(relayWebhookReceipts.deliveryKey, deliveryKey));
}

export async function logRelayAction(input: {
  campaignId?: number | null;
  action: string;
  outcome: "success" | "failed" | "skipped";
  detail: string;
  attemptCount?: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(relayActionLogs).values({
    campaignId: input.campaignId ?? null,
    action: input.action,
    outcome: input.outcome,
    detail: input.detail.slice(0, 500),
    attemptCount: input.attemptCount ?? 1,
  });
}

export async function getRelaySettingsMetadata() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(relaySettingsMetadata).orderBy(desc(relaySettingsMetadata.updatedAt));
}

export async function updateRelaySettingMetadata(input: {
  settingKey: string;
  rotatedAt?: Date | null;
  recoveryVaultVerifiedAt?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db
    .insert(relaySettingsMetadata)
    .values({
      settingKey: input.settingKey,
      configuredAt: new Date(),
      rotatedAt: input.rotatedAt ?? null,
      recoveryVaultVerifiedAt: input.recoveryVaultVerifiedAt ?? null,
    })
    .onDuplicateKeyUpdate({
      set: {
        configuredAt: new Date(),
        rotatedAt: input.rotatedAt ?? null,
        recoveryVaultVerifiedAt: input.recoveryVaultVerifiedAt ?? null,
      },
    });
}

export async function getRelayStatusData() {
  const db = await getDb();
  if (!db) {
    return { campaigns: [], recentActions: [], settingsMetadata: [], databaseAvailable: false };
  }

  const [campaigns, recentActions, settingsMetadata] = await Promise.all([
    db.select().from(relayCampaigns).orderBy(desc(relayCampaigns.updatedAt)).limit(25),
    db.select().from(relayActionLogs).orderBy(desc(relayActionLogs.createdAt)).limit(25),
    getRelaySettingsMetadata(),
  ]);

  return { campaigns, recentActions, settingsMetadata, databaseAvailable: true };
}
