CREATE INDEX `idx_ph_customer_id` ON `purchase_histories` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_ph_shop_id` ON `purchase_histories` (`shop_id`);--> statement-breakpoint
CREATE INDEX `idx_shops_tenant_id` ON `shops` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_sa_user_id_shop_id` ON `shop_assignments` (`user_id`, `shop_id`);
