CREATE TABLE `relay_office_at_hand_active_calls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(512) NOT NULL,
	`partyId` varchar(512) NOT NULL,
	`sequence` int NOT NULL,
	`status` varchar(32) NOT NULL,
	`callerPhoneCiphertext` text NOT NULL,
	`dialedPhoneCiphertext` text NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `relay_office_at_hand_active_calls_id` PRIMARY KEY(`id`),
	CONSTRAINT `relay_office_at_hand_active_call_session_party_unique` UNIQUE(`sessionId`,`partyId`)
);
--> statement-breakpoint
CREATE INDEX `relay_office_at_hand_active_call_expires_at_idx` ON `relay_office_at_hand_active_calls` (`expiresAt`);