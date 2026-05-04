PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_purchase_histories` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`shop_id` text NOT NULL,
	`purchased_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_purchase_histories`("id", "customer_id", "shop_id", "purchased_at") SELECT "id", "customer_id", "shop_id", "purchased_at" FROM `purchase_histories`;--> statement-breakpoint
DROP TABLE `purchase_histories`;--> statement-breakpoint
ALTER TABLE `__new_purchase_histories` RENAME TO `purchase_histories`;--> statement-breakpoint
PRAGMA foreign_keys=ON;