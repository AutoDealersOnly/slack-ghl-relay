CREATE TABLE `relay_mailpiece_image_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`status` enum('pending','scheduling','scheduled','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`taskUid` varchar(65),
	`scheduledFor` timestamp,
	`attemptCount` int NOT NULL DEFAULT 0,
	`startedAt` timestamp,
	`finishedAt` timestamp,
	`lastError` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `relay_mailpiece_image_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `relay_mailpiece_image_jobs_campaign_unique` UNIQUE(`campaignId`)
);
--> statement-breakpoint
CREATE INDEX `relay_mailpiece_image_jobs_task_uid_idx` ON `relay_mailpiece_image_jobs` (`taskUid`);--> statement-breakpoint
CREATE INDEX `relay_mailpiece_image_jobs_status_idx` ON `relay_mailpiece_image_jobs` (`status`);