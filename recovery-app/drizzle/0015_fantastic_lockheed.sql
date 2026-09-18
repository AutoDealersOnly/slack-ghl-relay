CREATE TABLE `relay_activity_dashboard_refresh_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobKey` varchar(96) NOT NULL,
	`taskUid` varchar(65) NOT NULL,
	`cronExpression` varchar(64) NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT true,
	`lastRunAt` timestamp,
	`lastSummary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `relay_activity_dashboard_refresh_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `relay_activity_dashboard_refresh_jobs_key_unique` UNIQUE(`jobKey`)
);
--> statement-breakpoint
CREATE TABLE `relay_activity_dashboards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`canvasId` varchar(32),
	`canvasStatus` enum('not_created','creating','ready','failed') NOT NULL DEFAULT 'not_created',
	`lastRefreshedAt` timestamp,
	`lastError` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `relay_activity_dashboards_id` PRIMARY KEY(`id`),
	CONSTRAINT `relay_activity_dashboards_campaign_unique` UNIQUE(`campaignId`)
);
--> statement-breakpoint
CREATE TABLE `relay_campaign_activity_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`source` enum('qr_visit','qr_appointment','phone_appointment','sms_appointment','oneclick_appointment') NOT NULL,
	`contactFingerprint` varchar(64) NOT NULL,
	`eventFingerprint` varchar(64) NOT NULL,
	`occurredAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `relay_campaign_activity_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `relay_campaign_activity_events_fingerprint_unique` UNIQUE(`eventFingerprint`)
);
--> statement-breakpoint
ALTER TABLE `relay_campaigns` ADD `dealershipLocationId` varchar(128);--> statement-breakpoint
ALTER TABLE `relay_campaigns` ADD `eventStartDate` varchar(32);--> statement-breakpoint
CREATE INDEX `relay_activity_dashboard_refresh_jobs_task_uid_idx` ON `relay_activity_dashboard_refresh_jobs` (`taskUid`);--> statement-breakpoint
CREATE INDEX `relay_activity_dashboards_refresh_idx` ON `relay_activity_dashboards` (`canvasStatus`,`lastRefreshedAt`);--> statement-breakpoint
CREATE INDEX `relay_campaign_activity_events_campaign_occurred_idx` ON `relay_campaign_activity_events` (`campaignId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `relay_campaign_activity_events_campaign_source_idx` ON `relay_campaign_activity_events` (`campaignId`,`source`);