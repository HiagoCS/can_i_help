CREATE TABLE `users` (
	`id` integer PRIMARY KEY,
	`email` text NOT NULL UNIQUE,
	`password` text NOT NULL,
	`avatar` text,
	`status` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`level` integer NOT NULL,
	`status` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roles_user` (
	`id` integer PRIMARY KEY,
	`role_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	CONSTRAINT `fk_roles_user_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`),
	CONSTRAINT `fk_roles_user_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY,
	`sm_code` text NOT NULL UNIQUE,
	`bar_code` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`description` text,
	`value` text DEFAULT '0.00',
	`cost` text DEFAULT '0.00',
	`amount` text DEFAULT '0',
	`status` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_method` (
	`id` integer PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`status` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `installments` (
	`id` integer PRIMARY KEY,
	`in_installments` integer NOT NULL,
	`percentage` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` integer PRIMARY KEY,
	`name` text NOT NULL,
	`cpf` text UNIQUE,
	`method_id` integer NOT NULL,
	CONSTRAINT `fk_clients_method_id_payment_method_id_fk` FOREIGN KEY (`method_id`) REFERENCES `payment_method`(`id`)
);
--> statement-breakpoint
CREATE TABLE `cashier` (
	`id` integer PRIMARY KEY,
	`total_value` real NOT NULL,
	`method_id` integer NOT NULL,
	`client_id` integer,
	`installment_id` integer,
	`dt_sale` text NOT NULL,
	CONSTRAINT `fk_cashier_method_id_payment_method_id_fk` FOREIGN KEY (`method_id`) REFERENCES `payment_method`(`id`),
	CONSTRAINT `fk_cashier_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`),
	CONSTRAINT `fk_cashier_installment_id_installments_id_fk` FOREIGN KEY (`installment_id`) REFERENCES `installments`(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_sale` (
	`id` integer PRIMARY KEY,
	`sale_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`qunt_sale` integer NOT NULL,
	CONSTRAINT `fk_stock_sale_sale_id_cashier_id_fk` FOREIGN KEY (`sale_id`) REFERENCES `cashier`(`id`),
	CONSTRAINT `fk_stock_sale_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`)
);
