PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_clients` (
	`id` integer PRIMARY KEY,
	`name` text NOT NULL,
	`cpf` text UNIQUE,
	`cnpj` text UNIQUE,
	`ie` text,
	`address` text,
	`number` text,
	`complement` text,
	`neighborhood` text,
	`city` text,
	`city_ibge` text,
	`state` text,
	`zip_code` text,
	`method_id` integer,
	CONSTRAINT `fk_clients_method_id_payment_method_id_fk` FOREIGN KEY (`method_id`) REFERENCES `payment_method`(`id`)
);
--> statement-breakpoint
INSERT INTO `__new_clients`(`id`, `name`, `cpf`, `cnpj`, `ie`, `address`, `number`, `complement`, `neighborhood`, `city`, `city_ibge`, `state`, `zip_code`, `method_id`) SELECT `id`, `name`, `cpf`, `cnpj`, `ie`, `address`, `number`, `complement`, `neighborhood`, `city`, `city_ibge`, `state`, `zip_code`, `method_id` FROM `clients`;--> statement-breakpoint
DROP TABLE `clients`;--> statement-breakpoint
ALTER TABLE `__new_clients` RENAME TO `clients`;--> statement-breakpoint
PRAGMA foreign_keys=ON;