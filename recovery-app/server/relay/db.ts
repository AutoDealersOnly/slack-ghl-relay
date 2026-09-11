import { and, desc, eq, inArray, lt } from "drizzle-orm";
import {
  relayActionLogs,
  relayArchiveReconciliationJobs,
  relayCampaigns,
  relayMailpieceImageJobs,
  relayMailpieceImageUploads,
  relayProofPdfAttachments,
  relaySettingsMetadata,
  relayWebhookReceipts,
} from "../../drizzle/schema";
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

export async function getCampaignById(campaignId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(relayCampaigns).where(eq(relayCampaigns.id, campaignId)).limit(1);
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

export const ARCHIVE_RECONCILIATION_JOB_KEY = "daily_archive_reconciliation";

export async function getArchiveReconciliationJobByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(relayArchiveReconciliationJobs)
    .where(eq(relayArchiveReconciliationJobs.taskUid, taskUid))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertArchiveReconciliationJob(input: {
  taskUid: string;
  cronExpression: string;
  isEnabled?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db
    .insert(relayArchiveReconciliationJobs)
    .values({
      jobKey: ARCHIVE_RECONCILIATION_JOB_KEY,
      taskUid: input.taskUid,
      cronExpression: input.cronExpression,
      isEnabled: input.isEnabled ?? true,
    })
    .onDuplicateKeyUpdate({
      set: {
        taskUid: input.taskUid,
        cronExpression: input.cronExpression,
        isEnabled: input.isEnabled ?? true,
      },
    });
}

export async function recordArchiveReconciliationRun(taskUid: string, summary: string) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db
    .update(relayArchiveReconciliationJobs)
    .set({ lastRunAt: new Date(), lastSummary: summary.slice(0, 4000) })
    .where(eq(relayArchiveReconciliationJobs.taskUid, taskUid));
}

/** Claims a Slack PDF for one campaign before any file transfer begins. */
export async function claimProofPdfAttachment(input: { campaignId: number; slackFileId: string }): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");

  const condition = and(
    eq(relayProofPdfAttachments.campaignId, input.campaignId),
    eq(relayProofPdfAttachments.slackFileId, input.slackFileId)
  );
  const existing = await db.select().from(relayProofPdfAttachments).where(condition).limit(1);
  if (existing[0]?.status === "attached" || existing[0]?.status === "processing") return false;

  if (existing[0]?.status === "failed") {
    await db.update(relayProofPdfAttachments).set({ status: "processing", ghlFileUrl: null }).where(condition);
    return true;
  }

  try {
    await db.insert(relayProofPdfAttachments).values(input);
    return true;
  } catch (error) {
    if (String(error).includes("Duplicate entry")) return false;
    throw error;
  }
}

export async function finishProofPdfAttachment(input: {
  campaignId: number;
  slackFileId: string;
  status: "attached" | "failed";
  ghlFileUrl?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(relayProofPdfAttachments)
    .set({ status: input.status, ghlFileUrl: input.ghlFileUrl ?? null })
    .where(
      and(
        eq(relayProofPdfAttachments.campaignId, input.campaignId),
        eq(relayProofPdfAttachments.slackFileId, input.slackFileId)
      )
    );
}

export type MailpieceImageClaim = { claimed: boolean; mediaUrl?: string | null };

/** Claims one selected PDF page so retries can reuse a successful image URL instead of creating duplicate media. */
export async function claimMailpieceImageUpload(input: {
  campaignId: number;
  slackFileId: string;
  pageNumber: number;
  imageSlot: "front" | "back";
}): Promise<MailpieceImageClaim> {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  const condition = and(
    eq(relayMailpieceImageUploads.campaignId, input.campaignId),
    eq(relayMailpieceImageUploads.slackFileId, input.slackFileId),
    eq(relayMailpieceImageUploads.pageNumber, input.pageNumber)
  );
  const existing = await db.select().from(relayMailpieceImageUploads).where(condition).limit(1);
  if (existing[0]?.status === "uploaded") return { claimed: false, mediaUrl: existing[0].mediaUrl };
  if (existing[0]?.status === "processing") {
    const staleBefore = Date.now() - 5 * 60 * 1000;
    if (existing[0].updatedAt.getTime() >= staleBefore) return { claimed: false };
    await db.update(relayMailpieceImageUploads).set({ status: "processing", mediaUrl: null, imageSlot: input.imageSlot }).where(condition);
    return { claimed: true };
  }
  if (existing[0]?.status === "failed") {
    await db.update(relayMailpieceImageUploads).set({ status: "processing", mediaUrl: null, imageSlot: input.imageSlot }).where(condition);
    return { claimed: true };
  }
  try {
    await db.insert(relayMailpieceImageUploads).values(input);
    return { claimed: true };
  } catch (error) {
    if (String(error).includes("Duplicate entry")) return { claimed: false };
    throw error;
  }
}

export async function finishMailpieceImageUpload(input: {
  campaignId: number;
  slackFileId: string;
  pageNumber: number;
  status: "uploaded" | "failed";
  mediaUrl?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(relayMailpieceImageUploads)
    .set({ status: input.status, mediaUrl: input.mediaUrl ?? null })
    .where(
      and(
        eq(relayMailpieceImageUploads.campaignId, input.campaignId),
        eq(relayMailpieceImageUploads.slackFileId, input.slackFileId),
        eq(relayMailpieceImageUploads.pageNumber, input.pageNumber)
      )
  );
}

export type MailpieceImageJobStatus = "pending" | "scheduling" | "scheduled" | "processing" | "completed" | "failed";
export const MAILPIECE_IMAGE_JOB_STALE_MS = 2 * 60 * 1000;

export type MailpieceImageJobScheduleClaim = {
  job: typeof relayMailpieceImageJobs.$inferSelect;
  shouldSchedule: boolean;
  priorTaskUid: string | null;
};

/** MySQL drivers may return a ResultSetHeader directly or as the first tuple element. */
export function getDatabaseAffectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
}

export function isDuplicateDatabaseEntryError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth += 1) {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (candidate.code === "ER_DUP_ENTRY" || String(candidate.message ?? current).toLowerCase().includes("duplicate entry")) return true;
    current = candidate.cause;
  }
  return false;
}

export function isMailpieceImageJobSchedulingEligible(input: {
  status: MailpieceImageJobStatus;
  updatedAt: Date;
  now?: Date;
}): boolean {
  if (input.status === "pending" || input.status === "failed") return true;
  if (input.status !== "processing") return false;
  return input.updatedAt.getTime() < (input.now ?? new Date()).getTime() - MAILPIECE_IMAGE_JOB_STALE_MS;
}

/**
 * Creates one durable job per campaign. A fresh Sent-to-Print delivery cannot
 * create a duplicate job, and a failed job is eligible to be scheduled again.
 */
export async function claimMailpieceImageJobForScheduling(campaignId: number): Promise<MailpieceImageJobScheduleClaim> {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");

  try {
    await db.insert(relayMailpieceImageJobs).values({ campaignId, status: "pending" });
  } catch (error) {
    if (!isDuplicateDatabaseEntryError(error)) throw error;
  }

  const rows = await db.select().from(relayMailpieceImageJobs).where(eq(relayMailpieceImageJobs.campaignId, campaignId)).limit(1);
  const job = rows[0];
  if (!job) throw new Error("Mailpiece image job was not found after creation");
  if (!isMailpieceImageJobSchedulingEligible({ status: job.status, updatedAt: job.updatedAt })) {
    return { job, shouldSchedule: false, priorTaskUid: null };
  }

  const priorTaskUid = job.taskUid;
  const staleBefore = new Date(Date.now() - MAILPIECE_IMAGE_JOB_STALE_MS);
  const scheduleCondition = job.status === "processing"
    ? and(eq(relayMailpieceImageJobs.status, "processing"), lt(relayMailpieceImageJobs.updatedAt, staleBefore))
    : inArray(relayMailpieceImageJobs.status, ["pending", "failed"]);
  const updateResult = await db
    .update(relayMailpieceImageJobs)
    .set({ status: "scheduling", lastError: null, finishedAt: null })
    .where(and(eq(relayMailpieceImageJobs.id, job.id), scheduleCondition));
  const changedRows = getDatabaseAffectedRows(updateResult);
  if (changedRows !== 1) {
    const current = (await db.select().from(relayMailpieceImageJobs).where(eq(relayMailpieceImageJobs.id, job.id)).limit(1))[0];
    if (!current) throw new Error("Mailpiece image job disappeared while scheduling");
    return { job: current, shouldSchedule: false, priorTaskUid: null };
  }

  const claimed = (await db.select().from(relayMailpieceImageJobs).where(eq(relayMailpieceImageJobs.id, job.id)).limit(1))[0];
  if (!claimed) throw new Error("Mailpiece image job was not found after scheduling claim");
  return { job: claimed, shouldSchedule: true, priorTaskUid };
}

export async function attachMailpieceImageJobTask(input: { jobId: number; taskUid: string; scheduledFor: Date }): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  const result = await db
    .update(relayMailpieceImageJobs)
    .set({ status: "scheduled", taskUid: input.taskUid, scheduledFor: input.scheduledFor })
    .where(and(eq(relayMailpieceImageJobs.id, input.jobId), eq(relayMailpieceImageJobs.status, "scheduling")));
  return getDatabaseAffectedRows(result) === 1;
}

export async function failMailpieceImageJobScheduling(input: { jobId: number; detail: string }) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(relayMailpieceImageJobs)
    .set({ status: "failed", finishedAt: new Date(), lastError: input.detail.slice(0, 500) })
    .where(eq(relayMailpieceImageJobs.id, input.jobId));
}

export async function getMailpieceImageJobByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(relayMailpieceImageJobs).where(eq(relayMailpieceImageJobs.taskUid, taskUid)).limit(1);
  return rows[0] ?? null;
}

export function isMailpieceImageJobRunEligible(input: {
  status: MailpieceImageJobStatus;
  updatedAt: Date;
  now?: Date;
}): boolean {
  if (input.status === "scheduled" || input.status === "failed") return true;
  if (input.status !== "processing") return false;
  return input.updatedAt.getTime() < (input.now ?? new Date()).getTime() - MAILPIECE_IMAGE_JOB_STALE_MS;
}

/** Claims a scheduled job for one run; jobs stuck in processing for five minutes can be safely retried. */
export async function claimMailpieceImageJobRun(taskUid: string): Promise<{ job: typeof relayMailpieceImageJobs.$inferSelect | null; claimed: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  const rows = await db.select().from(relayMailpieceImageJobs).where(eq(relayMailpieceImageJobs.taskUid, taskUid)).limit(1);
  const job = rows[0] ?? null;
  if (!job || job.status === "completed") return { job, claimed: false };

  const now = new Date();
  if (!isMailpieceImageJobRunEligible({ status: job.status, updatedAt: job.updatedAt, now })) return { job, claimed: false };
  const staleBefore = new Date(now.getTime() - MAILPIECE_IMAGE_JOB_STALE_MS);
  const eligibleCondition = job.status === "processing"
    ? and(eq(relayMailpieceImageJobs.status, "processing"), lt(relayMailpieceImageJobs.updatedAt, staleBefore))
    : eq(relayMailpieceImageJobs.status, job.status);

  const updateResult = await db
    .update(relayMailpieceImageJobs)
    .set({ status: "processing", attemptCount: job.attemptCount + 1, startedAt: now, finishedAt: null, lastError: null })
    .where(and(eq(relayMailpieceImageJobs.id, job.id), eligibleCondition));
  const changedRows = getDatabaseAffectedRows(updateResult);
  if (changedRows !== 1) return { job, claimed: false };
  const claimed = (await db.select().from(relayMailpieceImageJobs).where(eq(relayMailpieceImageJobs.id, job.id)).limit(1))[0] ?? null;
  return { job: claimed, claimed: true };
}

export async function completeMailpieceImageJob(input: { taskUid: string }) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(relayMailpieceImageJobs)
    .set({ status: "completed", finishedAt: new Date(), lastError: null })
    .where(eq(relayMailpieceImageJobs.taskUid, input.taskUid));
}

export async function failMailpieceImageJobRun(input: { taskUid: string; detail: string }) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(relayMailpieceImageJobs)
    .set({ status: "failed", finishedAt: new Date(), lastError: input.detail.slice(0, 500) })
    .where(eq(relayMailpieceImageJobs.taskUid, input.taskUid));
}
