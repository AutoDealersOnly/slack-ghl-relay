CREATE TABLE `relay_super_admin_archive_controls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`superAdminChannelId` varchar(32) NOT NULL,
	`slackMessageTs` varchar(32) NOT NULL,
	`status` enum('pending','kept_open','archived','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `relay_super_admin_archive_controls_id` PRIMARY KEY(`id`),
	CONSTRAINT `relay_super_admin_archive_controls_campaign_unique` UNIQUE(`campaignId`)
);
--> statement-breakpoint
CREATE TABLE `relay_super_admin_channels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`controlKey` varchar(64) NOT NULL,
	`channelId` varchar(32) NOT NULL,
	`channelName` varchar(128) NOT NULL,
	`canvasId` varchar(32),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `relay_super_admin_channels_id` PRIMARY KEY(`id`),
	CONSTRAINT `relay_super_admin_channels_control_key_unique` UNIQUE(`controlKey`),
	CONSTRAINT `relay_super_admin_channels_channel_id_unique` UNIQUE(`channelId`)
);
--> statement-breakpoint
CREATE INDEX `relay_super_admin_archive_controls_channel_status_idx` ON `relay_super_admin_archive_controls` (`superAdminChannelId`,`status`);