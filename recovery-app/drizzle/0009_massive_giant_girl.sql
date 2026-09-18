CREATE TABLE `relay_office_at_hand_test_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`providerSubscriptionId` varchar(128) NOT NULL,
	`status` varchar(32) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `relay_office_at_hand_test_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `relay_office_at_hand_test_subscription_provider_unique` UNIQUE(`providerSubscriptionId`)
);
--> statement-breakpoint
CREATE INDEX `relay_office_at_hand_test_subscription_expires_at_idx` ON `relay_office_at_hand_test_subscriptions` (`expiresAt`);