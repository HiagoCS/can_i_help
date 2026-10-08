CREATE TABLE `company` (
	`id` integer PRIMARY KEY,
	`cnpj` text NOT NULL UNIQUE,
	`legal_name` text NOT NULL,
	`trade_name` text,
	`state_registration` text NOT NULL,
	`municipal_registration` text,
	`tax_regime` text NOT NULL,
	`address` text NOT NULL,
	`number` text NOT NULL,
	`complement` text,
	`neighborhood` text NOT NULL,
	`city` text NOT NULL,
	`city_ibge` text NOT NULL,
	`state` text NOT NULL,
	`zip_code` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fiscal_config` (
	`id` integer PRIMARY KEY,
	`company_id` integer NOT NULL,
	`tax_regime` text NOT NULL,
	`cfop_default` text NOT NULL,
	`ncm_default` text NOT NULL,
	`ibs` real DEFAULT 0 NOT NULL,
	`cbs` real DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_fiscal_config_company_id_company_id_fk` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`)
);
--> statement-breakpoint
CREATE TABLE `fiscal_certificates` (
	`id` integer PRIMARY KEY,
	`company_id` integer NOT NULL,
	`certificate` text NOT NULL,
	`password` text NOT NULL,
	`valid_from` text,
	`valid_until` text,
	`status` integer DEFAULT false NOT NULL,
	CONSTRAINT `fk_fiscal_certificates_company_id_company_id_fk` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`)
);
--> statement-breakpoint
CREATE TABLE `fiscal_invoices` (
	`id` integer PRIMARY KEY,
	`sale_id` integer NOT NULL,
	`number` integer NOT NULL,
	`nat_op` text DEFAULT 'Venda de Mercadoria' NOT NULL,
	`tp_nf` integer DEFAULT 1 NOT NULL,
	`fin_nfe` integer DEFAULT 1 NOT NULL,
	`ind_final` integer DEFAULT 1 NOT NULL,
	`ind_pres` integer DEFAULT 1 NOT NULL,
	`ind_intermed` integer DEFAULT 0 NOT NULL,
	`id_dest` integer NOT NULL,
	`method_id` integer NOT NULL,
	`installment_id` integer,
	`xml` text,
	`xml_signed` text,
	`xml_authorized` text,
	`access_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`authorized_at` text,
	CONSTRAINT `fk_fiscal_invoices_sale_id_cashier_id_fk` FOREIGN KEY (`sale_id`) REFERENCES `cashier`(`id`),
	CONSTRAINT `fk_fiscal_invoices_method_id_payment_method_id_fk` FOREIGN KEY (`method_id`) REFERENCES `payment_method`(`id`),
	CONSTRAINT `fk_fiscal_invoices_installment_id_installments_id_fk` FOREIGN KEY (`installment_id`) REFERENCES `installments`(`id`)
);
--> statement-breakpoint
CREATE TABLE `fiscal_invoice_items` (
	`id` integer PRIMARY KEY,
	`fiscal_invoice_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`product_name` text NOT NULL,
	`bar_code` text,
	`ncm` text NOT NULL,
	`cfop` text NOT NULL,
	`quantity` integer NOT NULL,
	`original_unit_value` text NOT NULL,
	`unit_value` text NOT NULL,
	`discount` text DEFAULT '0.00' NOT NULL,
	`total_value` text NOT NULL,
	`cst` text DEFAULT '0' NOT NULL,
	`csosn` text DEFAULT '0' NOT NULL,
	`icms` real DEFAULT 0 NOT NULL,
	`ibs` real DEFAULT 0 NOT NULL,
	`cbs` real DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_fiscal_invoice_items_fiscal_invoice_id_fiscal_invoices_id_fk` FOREIGN KEY (`fiscal_invoice_id`) REFERENCES `fiscal_invoices`(`id`),
	CONSTRAINT `fk_fiscal_invoice_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`)
);
--> statement-breakpoint
CREATE TABLE `fiscal_invoice_totals` (
	`id` integer PRIMARY KEY,
	`fiscal_invoice_id` integer NOT NULL,
	`v_prod` text NOT NULL,
	`v_desc` text DEFAULT '0.00' NOT NULL,
	`v_frete` text DEFAULT '0.00' NOT NULL,
	`v_seg` text DEFAULT '0.00' NOT NULL,
	`v_outro` text DEFAULT '0.00' NOT NULL,
	`v_icms` text DEFAULT '0.00' NOT NULL,
	`v_pis` text DEFAULT '0.00' NOT NULL,
	`v_cofins` text DEFAULT '0.00' NOT NULL,
	`v_ipi` text DEFAULT '0.00' NOT NULL,
	`v_ibs` text DEFAULT '0.00' NOT NULL,
	`v_cbs` text DEFAULT '0.00' NOT NULL,
	`v_nf` text NOT NULL,
	CONSTRAINT `fk_fiscal_invoice_totals_fiscal_invoice_id_fiscal_invoices_id_fk` FOREIGN KEY (`fiscal_invoice_id`) REFERENCES `fiscal_invoices`(`id`)
);
--> statement-breakpoint
CREATE TABLE `sefaz_responses` (
	`id` integer PRIMARY KEY,
	`fiscal_invoice_id` integer NOT NULL,
	`status_code` text,
	`status` text,
	`message` text,
	`protocol` text,
	`receipt` text,
	`raw_response` text,
	`received_at` text NOT NULL,
	CONSTRAINT `fk_sefaz_responses_fiscal_invoice_id_fiscal_invoices_id_fk` FOREIGN KEY (`fiscal_invoice_id`) REFERENCES `fiscal_invoices`(`id`)
);
--> statement-breakpoint
CREATE TABLE `internal_documents` (
	`id` integer PRIMARY KEY,
	`sale_id` integer NOT NULL,
	`fiscal_invoice_id` integer,
	`pdf_path` text NOT NULL,
	`generated_at` text NOT NULL,
	CONSTRAINT `fk_internal_documents_sale_id_cashier_id_fk` FOREIGN KEY (`sale_id`) REFERENCES `cashier`(`id`),
	CONSTRAINT `fk_internal_documents_fiscal_invoice_id_fiscal_invoices_id_fk` FOREIGN KEY (`fiscal_invoice_id`) REFERENCES `fiscal_invoices`(`id`)
);
--> statement-breakpoint
CREATE TABLE `danfes` (
	`id` integer PRIMARY KEY,
	`fiscal_invoice_id` integer NOT NULL,
	`pdf_path` text NOT NULL,
	`generated_at` text NOT NULL,
	CONSTRAINT `fk_danfes_fiscal_invoice_id_fiscal_invoices_id_fk` FOREIGN KEY (`fiscal_invoice_id`) REFERENCES `fiscal_invoices`(`id`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD `ncm` text;--> statement-breakpoint
ALTER TABLE `products` ADD `cst` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `csosn` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `icms` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `cnpj` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `ie` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `address` text NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `number` text NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `complement` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `neighborhood` text NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `city` text NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `city_ibge` text NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `state` text NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `zip_code` text;--> statement-breakpoint
ALTER TABLE `stock_sale` ADD `value` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_clients` (
	`id` integer PRIMARY KEY,
	`name` text NOT NULL,
	`cpf` text UNIQUE,
	`cnpj` text UNIQUE,
	`ie` text,
	`address` text NOT NULL,
	`number` text NOT NULL,
	`complement` text,
	`neighborhood` text NOT NULL,
	`city` text NOT NULL,
	`city_ibge` text NOT NULL,
	`state` text NOT NULL,
	`zip_code` text,
	`method_id` integer NOT NULL,
	CONSTRAINT `fk_clients_method_id_payment_method_id_fk` FOREIGN KEY (`method_id`) REFERENCES `payment_method`(`id`)
);
--> statement-breakpoint
INSERT INTO `__new_clients`(`id`, `name`, `cpf`, `method_id`) SELECT `id`, `name`, `cpf`, `method_id` FROM `clients`;--> statement-breakpoint
DROP TABLE `clients`;--> statement-breakpoint
ALTER TABLE `__new_clients` RENAME TO `clients`;--> statement-breakpoint
PRAGMA foreign_keys=ON;