CREATE TABLE `relay_settings_metadata` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(96) NOT NULL,
	`configuredAt` timestamp,
	`rotatedAt` timestamp,
	`recoveryVaultVerifiedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `relay_settings_metadata_id` PRIMARY KEY(`id`),
	CONSTRAINT `relay_settings_metadata_setting_key_unique` UNIQUE(`settingKey`)
);
