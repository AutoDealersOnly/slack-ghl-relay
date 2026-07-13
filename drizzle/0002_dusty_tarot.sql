CREATE TABLE `channel_archive_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channelId` varchar(32) NOT NULL,
	`channelName` varchar(128) NOT NULL,
	`archiveAfter` timestamp NOT NULL,
	`taskUid` varchar(64),
	`status` enum('pending','archived','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `channel_archive_jobs_id` PRIMARY KEY(`id`)
);
