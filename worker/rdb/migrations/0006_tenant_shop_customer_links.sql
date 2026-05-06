CREATE TABLE `tenant_customer_links` (
	`tenant_id` text NOT NULL,
	`customer_id` text NOT NULL,
	PRIMARY KEY(`tenant_id`, `customer_id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `shop_customer_links` (
	`shop_id` text NOT NULL,
	`customer_id` text NOT NULL,
	PRIMARY KEY(`shop_id`, `customer_id`),
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT OR IGNORE INTO `shop_customer_links` (`shop_id`, `customer_id`) SELECT `shop_id`, `customer_id` FROM `purchase_histories`;--> statement-breakpoint
INSERT OR IGNORE INTO `tenant_customer_links` (`tenant_id`, `customer_id`) SELECT `shops`.`tenant_id`, `purchase_histories`.`customer_id` FROM `purchase_histories` INNER JOIN `shops` ON `shops`.`id` = `purchase_histories`.`shop_id`;
