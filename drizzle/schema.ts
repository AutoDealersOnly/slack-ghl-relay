import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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

// TODO: Add your tables here

/**
 * Tracks the most recent Slack canvas created per channel.
 * Used by the GHL webhook to find and replace the canvas when a record is updated.
 */
export const canvasLog = mysqlTable("canvas_log", {
  id: int("id").autoincrement().primaryKey(),
  /** Slack channel ID (e.g. C0BDSFS7LK1) */
  channelId: varchar("channelId", { length: 32 }).notNull().unique(),
  /** Slack channel name (e.g. 2607-westshore-honda-ame) */
  channelName: varchar("channelName", { length: 128 }).notNull(),
  /** Slack canvas ID (e.g. F0BEM0U5T6V) */
  canvasId: varchar("canvasId", { length: 32 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CanvasLog = typeof canvasLog.$inferSelect;
export type InsertCanvasLog = typeof canvasLog.$inferInsert;

/**
 * Tracks scheduled channel archive jobs.
 * Created when a Slack channel is auto-created; heartbeat fires at archiveAfter date.
 */
export const channelArchiveJobs = mysqlTable("channel_archive_jobs", {
  id: int("id").autoincrement().primaryKey(),
  /** Slack channel ID (e.g. C0BDSFS7LK1) */
  channelId: varchar("channelId", { length: 32 }).notNull(),
  /** Slack channel name (e.g. 2607-westshore-honda-ame) */
  channelName: varchar("channelName", { length: 128 }).notNull(),
  /** When to archive the channel (campaign_end_date + 3 days), UTC */
  archiveAfter: timestamp("archiveAfter").notNull(),
  /** Heartbeat job UID returned by createHeartbeatJob() */
  taskUid: varchar("taskUid", { length: 64 }),
  /** Job status */
  status: mysqlEnum("status", ["pending", "archived", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChannelArchiveJob = typeof channelArchiveJobs.$inferSelect;
export type InsertChannelArchiveJob = typeof channelArchiveJobs.$inferInsert;