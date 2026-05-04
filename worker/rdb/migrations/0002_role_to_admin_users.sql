ALTER TABLE `admin_users` ADD `tenant_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `admin_users` ADD `role` text DEFAULT 'shop_staff' NOT NULL;--> statement-breakpoint
ALTER TABLE `shop_assignments` DROP COLUMN `role`;--> statement-breakpoint
DROP TABLE `tenant_assignments`;
