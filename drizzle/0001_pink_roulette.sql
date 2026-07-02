CREATE TABLE `canvas_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channelId` varchar(32) NOT NULL,
	`channelName` varchar(128) NOT NULL,
	`canvasId` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `canvas_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `canvas_log_channelId_unique` UNIQUE(`channelId`)
);
