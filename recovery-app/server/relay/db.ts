import { and, desc, eq, gte, inArray, isNotNull, lt, ne } from "drizzle-orm";
import {
  relayActionLogs,
  relayActivityDashboardRefreshJobs,
  relayActivityDashboards,
  relayArchiveReconciliationJobs,
  relayCampaignActivityEvents,
  relayCampaigns,
  relayMailpieceImageJobs,
  relayMailpieceImageUploads,
  relayOfficeAtHandActiveCalls,
  relayOfficeAtHandAuthorizations,
  relayOfficeAtHandTestSubscriptions,
  relayProofPdfAttachments,
  relaySettingsMetadata,
  relaySuperAdminArchiveControls,
  relaySuperAdminChannels,
  relayWebhookReceipts,
} from "../../drizzle/schema";
import { getDb } from "../db";

export type CampaignUpsertInput = {
  productionName: string;
  channelName: string;
  channelId?: string | null;
  canvasId?: string | null;
  dealershipRecordId?: string | null;
  dealershipLocationId?: string | null;
  dealershipName?: string | null;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
};

type ExistingCampaignContext = {
  channelId?: string | null;
  canvasId?: string | null;
  dealershipRecordId?: string | null;
  dealershipLocationId?: string | null;
  dealershipName?: string | null;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
};

const meaningfulValue = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed || null;
};

/**
 * A partial GoHighLevel response must never erase the campaign context that a
 * previously successful Production Canvas update already saved. This protects
 * Activity Dashboard dates and dealership connections on ordinary /ghl refreshes.
 */
export function preserveCampaignContext(input: CampaignUpsertInput, existing?: ExistingCampaignContext | null) {
  const preserve = (incoming: string | null | undefined, saved: string | null | undefined) => meaningfulValue(incoming) ?? meaningfulValue(saved);
  return {
    channelId: preserve(input.channelId, existing?.channelId),
    canvasId: preserve(input.canvasId, existing?.canvasId),
    dealershipRecordId: preserve(input.dealershipRecordId, existing?.dealershipRecordId),
    dealershipLocationId: preserve(input.dealershipLocationId, existing?.dealershipLocationId),
    dealershipName: preserve(input.dealershipName, existing?.dealershipName),
    eventStartDate: preserve(input.eventStartDate, existing?.eventStartDate),
    eventEndDate: preserve(input.eventEndDate, existing?.eventEndDate),
  };
}

export const OFFICE_AT_HAND_ACTIVE_CALL_CONNECTION_KEY = "active_call_lookup_test";
export const SUPER_ADMIN_CONTROL_KEY = "super_admin";

/** Stores only encrypted renewable authorization data for the separate test app. */
export async function saveOfficeAtHandAuthorization(input: {
  ownerId?: string | null;
  refreshTokenCiphertext: string;
  refreshTokenExpiresAt?: Date | null;
  grantedScope?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db
    .insert(relayOfficeAtHandAuthorizations)
    .values({
      connectionKey: OFFICE_AT_HAND_ACTIVE_CALL_CONNECTION_KEY,
      ownerId: input.ownerId ?? null,
      refreshTokenCiphertext: input.refreshTokenCiphertext,
      refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
      grantedScope: input.grantedScope ?? null,
    })
    .onDuplicateKeyUpdate({
      set: {
        ownerId: input.ownerId ?? null,
        refreshTokenCiphertext: input.refreshTokenCiphertext,
        refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
        grantedScope: input.grantedScope ?? null,
      },
    });
}

/** Returns encrypted authorization material only for server-side provider refreshes. */
export async function getOfficeAtHandAuthorization() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(relayOfficeAtHandAuthorizations)
    .where(eq(relayOfficeAtHandAuthorizations.connectionKey, OFFICE_AT_HAND_ACTIVE_CALL_CONNECTION_KEY))
    .limit(1);
  return rows[0] ?? null;
}

/** Persists only a short-lived encrypted active-call record for the separate test board. */
export async function upsertOfficeAtHandActiveCall(input: {
  sessionId: string;
  partyId: string;
  sequence: number;
  status: string;
  callerPhoneCiphertext: string;
  dialedPhoneCiphertext: string;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  const existing = await db
    .select({ id: relayOfficeAtHandActiveCalls.id, sequence: relayOfficeAtHandActiveCalls.sequence })
    .from(relayOfficeAtHandActiveCalls)
    .where(and(eq(relayOfficeAtHandActiveCalls.sessionId, input.sessionId), eq(relayOfficeAtHandActiveCalls.partyId, input.partyId)))
    .limit(1);
  if (existing[0] && existing[0].sequence > input.sequence) return false;
  if (existing[0]) {
    await db.update(relayOfficeAtHandActiveCalls).set({
      sequence: input.sequence,
      status: input.status,
      callerPhoneCiphertext: input.callerPhoneCiphertext,
      dialedPhoneCiphertext: input.dialedPhoneCiphertext,
      receivedAt: new Date(),
      expiresAt: input.expiresAt,
    }).where(eq(relayOfficeAtHandActiveCalls.id, existing[0].id));
    return true;
  }
  await db.insert(relayOfficeAtHandActiveCalls).values(input);
  return true;
}

export async function listCurrentOfficeAtHandActiveCalls() {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  await db.delete(relayOfficeAtHandActiveCalls).where(lt(relayOfficeAtHandActiveCalls.expiresAt, now));
  return db.select().from(relayOfficeAtHandActiveCalls).where(gte(relayOfficeAtHandActiveCalls.expiresAt, now));
}

export async function removeOfficeAtHandActiveCall(sessionId: string, partyId: string) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db.delete(relayOfficeAtHandActiveCalls).where(
    and(eq(relayOfficeAtHandActiveCalls.sessionId, sessionId), eq(relayOfficeAtHandActiveCalls.partyId, partyId))
  );
}

/** Stores the provider identifier and selected Dealership record for the one time-limited test feed. */
export async function saveOfficeAtHandTestSubscription(input: { providerSubscriptionId: string; dealershipRecordId: string; status: string; expiresAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db.insert(relayOfficeAtHandTestSubscriptions).values(input).onDuplicateKeyUpdate({
    set: { dealershipRecordId: input.dealershipRecordId, status: input.status, expiresAt: input.expiresAt },
  });
}

/** Returns the current short-lived test subscription without exposing any call data. */
export async function getCurrentOfficeAtHandTestSubscription() {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  const rows = await db
    .select({ dealerRecordId: relayOfficeAtHandTestSubscriptions.dealershipRecordId, expiresAt: relayOfficeAtHandTestSubscriptions.expiresAt })
    .from(relayOfficeAtHandTestSubscriptions)
    .where(gte(relayOfficeAtHandTestSubscriptions.expiresAt, new Date()))
    .orderBy(desc(relayOfficeAtHandTestSubscriptions.expiresAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Confirms an inbound event belongs to the currently approved, non-expired test feed. */
export async function hasCurrentOfficeAtHandTestSubscription(subscriptionId: string): Promise<boolean> {
  const db = await getDb();
  if (!db || !subscriptionId) return false;
  const rows = await db
    .select({ id: relayOfficeAtHandTestSubscriptions.id })
    .from(relayOfficeAtHandTestSubscriptions)
    .where(and(
      eq(relayOfficeAtHandTestSubscriptions.providerSubscriptionId, subscriptionId),
      gte(relayOfficeAtHandTestSubscriptions.expiresAt, new Date())
    ))
    .limit(1);
  return Boolean(rows[0]);
}

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
  const existing = await getCampaignByChannelName(input.channelName);
  const context = preserveCampaignContext(input, existing);

  await db
    .insert(relayCampaigns)
    .values({
      productionName: input.productionName,
      channelName: input.channelName,
      ...context,
    })
    .onDuplicateKeyUpdate({
      set: {
        productionName: input.productionName,
        ...context,
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

export type ActivityDashboardStatus = "not_created" | "creating" | "ready" | "failed";
export type ActivityDashboardSource = "qr_visit" | "qr_appointment" | "phone_appointment" | "sms_appointment" | "oneclick_appointment" | "ai_booked_appointment" | "qr_show";
export type ActivityDashboardCaptureMethod = "workflow" | "manual_tag";

/** Ensures a campaign has one separate Activity Dashboard record, without touching its Production Canvas. */
export async function registerActivityDashboard(campaignId: number) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db.insert(relayActivityDashboards).values({ campaignId }).onDuplicateKeyUpdate({ set: { campaignId } });
  const rows = await db.select().from(relayActivityDashboards).where(eq(relayActivityDashboards.campaignId, campaignId)).limit(1);
  if (!rows[0]) throw new Error("Activity Dashboard record was not found after registration");
  return rows[0];
}

export async function getActivityDashboard(campaignId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(relayActivityDashboards).where(eq(relayActivityDashboards.campaignId, campaignId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Resolves an incoming location-scoped activity notice only when exactly one
 * open campaign has a ready, separate Activity Dashboard. Ambiguity is refused
 * rather than allowing activity from one dealership campaign to count on another.
 */
export async function findOpenActivityDashboardCampaignByLocation(dealershipLocationId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({
    id: relayCampaigns.id,
    productionName: relayCampaigns.productionName,
    channelName: relayCampaigns.channelName,
    channelId: relayCampaigns.channelId,
    eventStartDate: relayCampaigns.eventStartDate,
    archiveStatus: relayCampaigns.archiveStatus,
  }).from(relayCampaigns)
    .innerJoin(relayActivityDashboards, eq(relayCampaigns.id, relayActivityDashboards.campaignId))
    .where(and(
      eq(relayCampaigns.dealershipLocationId, dealershipLocationId),
      eq(relayActivityDashboards.canvasStatus, "ready"),
      ne(relayCampaigns.archiveStatus, "archived")
    ));
  return rows.length === 1 ? rows[0] : null;
}

/** Claims a missing or failed separate Canvas before it is created, preventing duplicate tabs on webhook retries. */
export async function claimActivityDashboardCanvasCreation(campaignId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  const result = await db.update(relayActivityDashboards)
    .set({ canvasStatus: "creating", lastError: null })
    .where(and(
      eq(relayActivityDashboards.campaignId, campaignId),
      inArray(relayActivityDashboards.canvasStatus, ["not_created", "failed"])
    ));
  return getDatabaseAffectedRows(result) === 1;
}

/** Saves a Canvas creation or direct edit result. A null Canvas ID never replaces a saved Canvas ID. */
export async function completeActivityDashboardCanvasCreation(input: {
  campaignId: number;
  canvasId: string | null;
  refreshedAt?: Date;
  failureDetail?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db.update(relayActivityDashboards).set({
    ...(input.canvasId ? { canvasId: input.canvasId, canvasStatus: "ready" as const, lastRefreshedAt: input.refreshedAt ?? new Date(), lastError: null } : { canvasStatus: "failed" as const, lastError: input.failureDetail?.slice(0, 500) ?? "Activity Dashboard Canvas was not created." }),
  }).where(eq(relayActivityDashboards.campaignId, input.campaignId));
}

/** Lists saved Activity Dashboard Canvases only. The caller applies its campaign-window and ABC-only safeguards. */
export async function listActivityDashboardRefreshCandidates() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    campaignId: relayCampaigns.id,
    productionName: relayCampaigns.productionName,
    channelName: relayCampaigns.channelName,
    channelId: relayCampaigns.channelId,
    dealershipRecordId: relayCampaigns.dealershipRecordId,
    dealershipLocationId: relayCampaigns.dealershipLocationId,
    eventStartDate: relayCampaigns.eventStartDate,
    eventEndDate: relayCampaigns.eventEndDate,
    archiveStatus: relayCampaigns.archiveStatus,
    canvasId: relayActivityDashboards.canvasId,
  }).from(relayActivityDashboards)
    .innerJoin(relayCampaigns, eq(relayActivityDashboards.campaignId, relayCampaigns.id))
    .where(eq(relayActivityDashboards.canvasStatus, "ready"));
}

/** Reads only protected contact fingerprints and source values for in-window dashboard totals. */
export async function getCampaignActivityMetrics(campaignId: number, collectedOnOrAfter: Date) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    source: relayCampaignActivityEvents.source,
    captureMethod: relayCampaignActivityEvents.captureMethod,
    contactFingerprint: relayCampaignActivityEvents.contactFingerprint,
  })
    .from(relayCampaignActivityEvents)
    .where(and(eq(relayCampaignActivityEvents.campaignId, campaignId), gte(relayCampaignActivityEvents.occurredAt, collectedOnOrAfter)));
}

/** Inserts one immutable source activity only once, even if GoHighLevel retries a webhook action. */
export async function recordCampaignActivityEvent(input: {
  campaignId: number;
  source: ActivityDashboardSource;
  captureMethod?: ActivityDashboardCaptureMethod;
  contactFingerprint: string;
  eventFingerprint: string;
  occurredAt: Date;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  try {
    await db.insert(relayCampaignActivityEvents).values({ ...input, captureMethod: input.captureMethod ?? "workflow" });
    return true;
  } catch (error) {
    if (isDuplicateDatabaseEntryError(error)) return false;
    throw error;
  }
}

export const ACTIVITY_DASHBOARD_REFRESH_JOB_KEY = "activity_dashboard_refresh";

export async function getActivityDashboardRefreshJob() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(relayActivityDashboardRefreshJobs)
    .where(eq(relayActivityDashboardRefreshJobs.jobKey, ACTIVITY_DASHBOARD_REFRESH_JOB_KEY)).limit(1);
  return rows[0] ?? null;
}

export async function saveActivityDashboardRefreshJob(input: { taskUid: string; cronExpression: string; isEnabled?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db.insert(relayActivityDashboardRefreshJobs).values({
    jobKey: ACTIVITY_DASHBOARD_REFRESH_JOB_KEY,
    taskUid: input.taskUid,
    cronExpression: input.cronExpression,
    isEnabled: input.isEnabled ?? true,
  }).onDuplicateKeyUpdate({ set: { taskUid: input.taskUid, cronExpression: input.cronExpression, isEnabled: input.isEnabled ?? true } });
}

export async function getActivityDashboardRefreshJobByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(relayActivityDashboardRefreshJobs)
    .where(eq(relayActivityDashboardRefreshJobs.taskUid, taskUid)).limit(1);
  return rows[0] ?? null;
}

export async function recordActivityDashboardRefreshRun(taskUid: string, summary: string) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db.update(relayActivityDashboardRefreshJobs).set({ lastRunAt: new Date(), lastSummary: summary.slice(0, 4000) })
    .where(eq(relayActivityDashboardRefreshJobs.taskUid, taskUid));
}

/** Returns the one active private Super Admin channel, if setup has completed. */
export async function getActiveSuperAdminChannel() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(relaySuperAdminChannels)
    .where(and(eq(relaySuperAdminChannels.controlKey, SUPER_ADMIN_CONTROL_KEY), eq(relaySuperAdminChannels.isActive, true)))
    .limit(1);
  return rows[0] ?? null;
}

/** Saves the user-created private #super-admin channel without storing membership or credentials. */
export async function saveSuperAdminChannel(input: { channelId: string; channelName: string; canvasId?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db.insert(relaySuperAdminChannels).values({
    controlKey: SUPER_ADMIN_CONTROL_KEY,
    channelId: input.channelId,
    channelName: input.channelName,
    canvasId: input.canvasId ?? null,
    isActive: true,
  }).onDuplicateKeyUpdate({
    set: { channelId: input.channelId, channelName: input.channelName, canvasId: input.canvasId ?? null, isActive: true },
  });
  return getActiveSuperAdminChannel();
}

export async function updateSuperAdminCanvasId(canvasId: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db.update(relaySuperAdminChannels).set({ canvasId }).where(eq(relaySuperAdminChannels.controlKey, SUPER_ADMIN_CONTROL_KEY));
}

/** Saves the one bot-authored Production Canvas refresh launcher timestamp for the active private Super Admin channel. */
export async function updateSuperAdminCanvasRepairMessageTs(canvasRepairMessageTs: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db.update(relaySuperAdminChannels).set({ canvasRepairMessageTs }).where(eq(relaySuperAdminChannels.controlKey, SUPER_ADMIN_CONTROL_KEY));
}

/** Saves the one permanent Manage Pending Archives launcher timestamp for the active Super Admin channel. */
export async function updateSuperAdminArchiveManagerMessageTs(archiveManagerMessageTs: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db.update(relaySuperAdminChannels).set({ archiveManagerMessageTs }).where(eq(relaySuperAdminChannels.controlKey, SUPER_ADMIN_CONTROL_KEY));
}

/** Lists only campaigns that still have an individual pending archive job. */
export async function listPendingCampaignArchives() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(relayCampaigns)
    .where(and(
      eq(relayCampaigns.archiveStatus, "scheduled"),
      isNotNull(relayCampaigns.archiveTaskUid),
      isNotNull(relayCampaigns.channelId)
    ))
    .orderBy(relayCampaigns.archiveAfter);
}

/** Lists the current channel-linked campaigns for the private Super Admin Canvas repair picker. */
export async function listSuperAdminCanvasRepairCandidates() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: relayCampaigns.id,
      productionName: relayCampaigns.productionName,
      channelName: relayCampaigns.channelName,
      channelId: relayCampaigns.channelId,
      canvasId: relayCampaigns.canvasId,
    })
    .from(relayCampaigns)
    .where(isNotNull(relayCampaigns.channelId))
    .orderBy(desc(relayCampaigns.updatedAt))
    .limit(100);
}

export async function getSuperAdminArchiveControl(campaignId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(relaySuperAdminArchiveControls)
    .where(eq(relaySuperAdminArchiveControls.campaignId, campaignId))
    .limit(1);
  return rows[0] ?? null;
}

/** Lists the old per-campaign card records only so the Canvas-list migration can remove their bot messages once. */
export async function listSuperAdminArchiveControls(superAdminChannelId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(relaySuperAdminArchiveControls)
    .where(eq(relaySuperAdminArchiveControls.superAdminChannelId, superAdminChannelId));
}

/** Upserts the one bot-authored Keep Open control tied to a campaign archive registration. */
export async function saveSuperAdminArchiveControl(input: {
  campaignId: number;
  superAdminChannelId: string;
  slackMessageTs: string;
  status: "pending" | "processing" | "kept_open" | "archived" | "failed";
}) {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db.insert(relaySuperAdminArchiveControls).values(input).onDuplicateKeyUpdate({
    set: {
      superAdminChannelId: input.superAdminChannelId,
      slackMessageTs: input.slackMessageTs,
      status: input.status,
    },
  });
  return getSuperAdminArchiveControl(input.campaignId);
}

export async function updateSuperAdminArchiveControlStatus(campaignId: number, status: "pending" | "processing" | "kept_open" | "archived" | "failed") {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  await db.update(relaySuperAdminArchiveControls).set({ status }).where(eq(relaySuperAdminArchiveControls.campaignId, campaignId));
}

/** Claims one pending Keep Open control before cancelling its linked archive job. */
export async function claimPendingSuperAdminArchiveControl(input: { campaignId: number; superAdminChannelId: string }): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Relay database is unavailable");
  const result = await db.update(relaySuperAdminArchiveControls).set({ status: "processing" }).where(and(
    eq(relaySuperAdminArchiveControls.campaignId, input.campaignId),
    eq(relaySuperAdminArchiveControls.superAdminChannelId, input.superAdminChannelId),
    eq(relaySuperAdminArchiveControls.status, "pending")
  ));
  return getDatabaseAffectedRows(result) === 1;
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

/**
 * The daily reconciliation registration is the durable, project-wide archive
 * switch. If it is paused, no new campaign archive or warning job may be
 * created, and scheduled callbacks must leave any surviving job untouched.
 */
export async function isCampaignAutoarchiveEnabled(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ isEnabled: relayArchiveReconciliationJobs.isEnabled })
    .from(relayArchiveReconciliationJobs)
    .where(eq(relayArchiveReconciliationJobs.jobKey, ARCHIVE_RECONCILIATION_JOB_KEY))
    .limit(1);
  return rows[0]?.isEnabled === true;
}

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
