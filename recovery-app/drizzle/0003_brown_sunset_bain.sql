CREATE TABLE `relay_archive_reconciliation_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobKey` varchar(96) NOT NULL,
	`taskUid` varchar(65),
	`cronExpression` varchar(64) NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT true,
	`lastRunAt` timestamp,
	`lastSummary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `relay_archive_reconciliation_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `relay_archive_reconciliation_jobs_job_key_unique` UNIQUE(`jobKey`)
);
--> statement-breakpoint
CREATE INDEX `relay_archive_reconciliation_jobs_task_uid_idx` ON `relay_archive_reconciliation_jobs` (`taskUid`);