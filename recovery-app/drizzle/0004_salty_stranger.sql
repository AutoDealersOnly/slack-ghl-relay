CREATE TABLE `relay_proof_pdf_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`slackFileId` varchar(32) NOT NULL,
	`status` enum('processing','attached','failed') NOT NULL DEFAULT 'processing',
	`ghlFileUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `relay_proof_pdf_attachments_id` PRIMARY KEY(`id`),
	CONSTRAINT `relay_proof_pdf_campaign_file_unique` UNIQUE(`campaignId`,`slackFileId`)
);
--> statement-breakpoint
CREATE INDEX `relay_proof_pdf_campaign_idx` ON `relay_proof_pdf_attachments` (`campaignId`);