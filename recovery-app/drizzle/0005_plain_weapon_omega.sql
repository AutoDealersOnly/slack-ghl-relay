CREATE TABLE `relay_mailpiece_image_uploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`slackFileId` varchar(32) NOT NULL,
	`pageNumber` int NOT NULL,
	`imageSlot` enum('front','back') NOT NULL,
	`status` enum('processing','uploaded','failed') NOT NULL DEFAULT 'processing',
	`mediaUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `relay_mailpiece_image_uploads_id` PRIMARY KEY(`id`),
	CONSTRAINT `relay_mailpiece_image_campaign_file_page_unique` UNIQUE(`campaignId`,`slackFileId`,`pageNumber`)
);
--> statement-breakpoint
CREATE INDEX `relay_mailpiece_image_campaign_idx` ON `relay_mailpiece_image_uploads` (`campaignId`);