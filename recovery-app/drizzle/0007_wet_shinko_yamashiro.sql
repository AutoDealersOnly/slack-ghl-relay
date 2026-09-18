CREATE TABLE `relay_office_at_hand_authorizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`connectionKey` varchar(96) NOT NULL,
	`ownerId` varchar(96),
	`refreshTokenCiphertext` text NOT NULL,
	`refreshTokenExpiresAt` timestamp,
	`grantedScope` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `relay_office_at_hand_authorizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `relay_office_at_hand_authorizations_connection_key_unique` UNIQUE(`connectionKey`)
);
