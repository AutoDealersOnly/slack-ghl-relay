CREATE TABLE `relay_action_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int,
	`action` varchar(96) NOT NULL,
	`outcome` enum('success','failed','skipped') NOT NULL,
	`detail` text NOT NULL,
	`attemptCount` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `relay_action_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `relay_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productionName` varchar(255) NOT NULL,
	`channelName` varchar(128) NOT NULL,
	`channelId` varchar(32),
	`canvasId` varchar(32),
	`dealershipRecordId` varchar(128),
	`dealershipName` varchar(255),
	`eventEndDate` varchar(32),
	`archiveAfter` timestamp,
	`archiveTaskUid` varchar(65),
	`warningTaskUid` varchar(65),
	`archiveStatus` enum('not_scheduled','scheduled','cancelled','archived','failed') NOT NULL DEFAULT 'not_scheduled',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `relay_campaigns_id` PRIMARY KEY(`id`),
	CONSTRAINT `relay_campaigns_channel_name_unique` UNIQUE(`channelName`)
);
--> statement-breakpoint
CREATE TABLE `relay_webhook_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deliveryKey` varchar(128) NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`payloadHash` varchar(128) NOT NULL,
	`outcome` enum('accepted','processed','failed') NOT NULL DEFAULT 'accepted',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp,
	CONSTRAINT `relay_webhook_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `relay_webhook_receipts_delivery_key_unique` UNIQUE(`deliveryKey`)
);
--> statement-breakpoint
CREATE INDEX `relay_action_logs_campaign_idx` ON `relay_action_logs` (`campaignId`);--> statement-breakpoint
CREATE INDEX `relay_action_logs_created_at_idx` ON `relay_action_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `relay_campaigns_archive_task_uid_idx` ON `relay_campaigns` (`archiveTaskUid`);--> statement-breakpoint
CREATE INDEX `relay_campaigns_warning_task_uid_idx` ON `relay_campaigns` (`warningTaskUid`);--> statement-breakpoint
CREATE INDEX `relay_webhook_receipts_event_type_idx` ON `relay_webhook_receipts` (`eventType`);