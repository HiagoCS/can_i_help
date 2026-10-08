ALTER TABLE `products` ADD `unit_measure` text DEFAULT 'UN' NOT NULL;--> statement-breakpoint
ALTER TABLE `update_stock` ADD `reference_id` integer;--> statement-breakpoint
ALTER TABLE `update_stock` ADD `movement_value` text;--> statement-breakpoint
ALTER TABLE `update_stock` ADD `unit_measure` text DEFAULT 'UN' NOT NULL;--> statement-breakpoint
ALTER TABLE `update_stock` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `stock_sale` ADD `unit_measure` text DEFAULT 'UN' NOT NULL;--> statement-breakpoint
ALTER TABLE `fiscal_invoice_items` ADD `unit_measure` text DEFAULT 'UN' NOT NULL;