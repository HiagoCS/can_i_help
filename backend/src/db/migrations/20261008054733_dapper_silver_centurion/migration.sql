ALTER TABLE `company` ADD `boss_user_id` integer REFERENCES `users`(`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `company_boss_user_id_unique` ON `company` (`boss_user_id`);--> statement-breakpoint
UPDATE `company`
SET `boss_user_id` = (
    SELECT ru.user_id
    FROM `roles_user` ru
    INNER JOIN `roles` r ON r.id = ru.role_id
    WHERE r.name = 'boss' AND r.level >= 3
    ORDER BY ru.user_id
    LIMIT 1
)
WHERE `boss_user_id` IS NULL;--> statement-breakpoint
ALTER TABLE `fiscal_config` ADD `nat_op_default` text DEFAULT 'Venda de Mercadoria' NOT NULL;