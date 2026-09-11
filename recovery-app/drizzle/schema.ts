import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const relayCampaigns = mysqlTable(
  "relay_campaigns",
  {
    id: int("id").autoincrement().primaryKey(),
    productionName: varchar("productionName", { length: 255 }).notNull(),
    channelName: varchar("channelName", { length: 128 }).notNull(),
    channelId: varchar("channelId", { length: 32 }),
    canvasId: varchar("canvasId", { length: 32 }),
    dealershipRecordId: varchar("dealershipRecordId", { length: 128 }),
    dealershipName: varchar("dealershipName", { length: 255 }),
    eventEndDate: varchar("eventEndDate", { length: 32 }),
    archiveAfter: timestamp("archiveAfter"),
    archiveTaskUid: varchar("archiveTaskUid", { length: 65 }),
    warningTaskUid: varchar("warningTaskUid", { length: 65 }),
    archiveStatus: mysqlEnum("archiveStatus", ["not_scheduled", "scheduled", "cancelled", "archived", "failed"])
      .default("not_scheduled")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    channelNameUnique: uniqueIndex("relay_campaigns_channel_name_unique").on(table.channelName),
    archiveTaskUidIndex: index("relay_campaigns_archive_task_uid_idx").on(table.archiveTaskUid),
    warningTaskUidIndex: index("relay_campaigns_warning_task_uid_idx").on(table.warningTaskUid),
  })
);

export const relayWebhookReceipts = mysqlTable(
  "relay_webhook_receipts",
  {
    id: int("id").autoincrement().primaryKey(),
    deliveryKey: varchar("deliveryKey", { length: 128 }).notNull(),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    payloadHash: varchar("payloadHash", { length: 128 }).notNull(),
    outcome: mysqlEnum("outcome", ["accepted", "processed", "failed"])
      .default("accepted")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    processedAt: timestamp("processedAt"),
  },
  table => ({
    deliveryKeyUnique: uniqueIndex("relay_webhook_receipts_delivery_key_unique").on(table.deliveryKey),
    eventTypeIndex: index("relay_webhook_receipts_event_type_idx").on(table.eventType),
  })
);

export const relayActionLogs = mysqlTable(
  "relay_action_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId"),
    action: varchar("action", { length: 96 }).notNull(),
    outcome: mysqlEnum("outcome", ["success", "failed", "skipped"])
      .notNull(),
    detail: text("detail").notNull(),
    attemptCount: int("attemptCount").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    campaignIndex: index("relay_action_logs_campaign_idx").on(table.campaignId),
    createdAtIndex: index("relay_action_logs_created_at_idx").on(table.createdAt),
  })
);

export const relaySettingsMetadata = mysqlTable(
  "relay_settings_metadata",
  {
    id: int("id").autoincrement().primaryKey(),
    settingKey: varchar("settingKey", { length: 96 }).notNull(),
    configuredAt: timestamp("configuredAt"),
    rotatedAt: timestamp("rotatedAt"),
    recoveryVaultVerifiedAt: timestamp("recoveryVaultVerifiedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    settingKeyUnique: uniqueIndex("relay_settings_metadata_setting_key_unique").on(table.settingKey),
  })
);

/** Durable platform-job record for the daily campaign-archive reconciliation guard. */
export const relayArchiveReconciliationJobs = mysqlTable(
  "relay_archive_reconciliation_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    jobKey: varchar("jobKey", { length: 96 }).notNull(),
    taskUid: varchar("taskUid", { length: 65 }),
    cronExpression: varchar("cronExpression", { length: 64 }).notNull(),
    isEnabled: boolean("isEnabled").default(true).notNull(),
    lastRunAt: timestamp("lastRunAt"),
    lastSummary: text("lastSummary"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    jobKeyUnique: uniqueIndex("relay_archive_reconciliation_jobs_job_key_unique").on(table.jobKey),
    taskUidIndex: index("relay_archive_reconciliation_jobs_task_uid_idx").on(table.taskUid),
  })
);

/** Records each Slack PDF attached to a Production Proof field so webhook retries cannot add it twice. */
export const relayProofPdfAttachments = mysqlTable(
  "relay_proof_pdf_attachments",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    slackFileId: varchar("slackFileId", { length: 32 }).notNull(),
    status: mysqlEnum("status", ["processing", "attached", "failed"]).default("processing").notNull(),
    ghlFileUrl: text("ghlFileUrl"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    campaignFileUnique: uniqueIndex("relay_proof_pdf_campaign_file_unique").on(table.campaignId, table.slackFileId),
    campaignIndex: index("relay_proof_pdf_campaign_idx").on(table.campaignId),
  })
);

/** Records per-page mailpiece image uploads so the same Slack PDF page is never rendered and uploaded twice for one campaign. */
export const relayMailpieceImageUploads = mysqlTable(
  "relay_mailpiece_image_uploads",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    slackFileId: varchar("slackFileId", { length: 32 }).notNull(),
    pageNumber: int("pageNumber").notNull(),
    imageSlot: mysqlEnum("imageSlot", ["front", "back"]).notNull(),
    status: mysqlEnum("status", ["processing", "uploaded", "failed"]).default("processing").notNull(),
    mediaUrl: text("mediaUrl"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    campaignFilePageUnique: uniqueIndex("relay_mailpiece_image_campaign_file_page_unique").on(table.campaignId, table.slackFileId, table.pageNumber),
    campaignIndex: index("relay_mailpiece_image_campaign_idx").on(table.campaignId),
  })
);

/** One durable, platform-scheduled mailpiece-processing job per campaign. */
export const relayMailpieceImageJobs = mysqlTable(
  "relay_mailpiece_image_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId").notNull(),
    status: mysqlEnum("status", ["pending", "scheduling", "scheduled", "processing", "completed", "failed"])
      .default("pending")
      .notNull(),
    taskUid: varchar("taskUid", { length: 65 }),
    scheduledFor: timestamp("scheduledFor"),
    attemptCount: int("attemptCount").default(0).notNull(),
    startedAt: timestamp("startedAt"),
    finishedAt: timestamp("finishedAt"),
    lastError: varchar("lastError", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    campaignUnique: uniqueIndex("relay_mailpiece_image_jobs_campaign_unique").on(table.campaignId),
    taskUidIndex: index("relay_mailpiece_image_jobs_task_uid_idx").on(table.taskUid),
    statusIndex: index("relay_mailpiece_image_jobs_status_idx").on(table.status),
  })
);

export type RelayCampaign = typeof relayCampaigns.$inferSelect;
export type InsertRelayCampaign = typeof relayCampaigns.$inferInsert;
export type RelayWebhookReceipt = typeof relayWebhookReceipts.$inferSelect;
export type RelayActionLog = typeof relayActionLogs.$inferSelect;
export type RelaySettingMetadata = typeof relaySettingsMetadata.$inferSelect;
export type RelayArchiveReconciliationJob = typeof relayArchiveReconciliationJobs.$inferSelect;
export type RelayProofPdfAttachment = typeof relayProofPdfAttachments.$inferSelect;
export type RelayMailpieceImageUpload = typeof relayMailpieceImageUploads.$inferSelect;
export type RelayMailpieceImageJob = typeof relayMailpieceImageJobs.$inferSelect;
