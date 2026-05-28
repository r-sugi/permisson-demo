-- purchase_histories に tenant_id を追加（破壊的変更）
-- 後方互換なし: 既存データは保持しない。migrate 後は db:reset:seed 前提。

-- shops(id, tenant_id) への複合参照のため UNIQUE を付与
CREATE UNIQUE INDEX IF NOT EXISTS `idx_shops_id_tenant_id` ON `shops` (`id`, `tenant_id`);--> statement-breakpoint

-- 旧 purchase_histories を破棄して作り直す
DROP TABLE IF EXISTS `purchase_histories`;--> statement-breakpoint

CREATE TABLE `purchase_histories` (
  `id` text PRIMARY KEY NOT NULL,
  `customer_id` text NOT NULL,
  `shop_id` text NOT NULL,
  `tenant_id` text NOT NULL,
  `purchased_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`shop_id`, `tenant_id`) REFERENCES `shops`(`id`, `tenant_id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

-- 索引（0005 で作っていた分もここで再作成する）
CREATE INDEX IF NOT EXISTS `idx_ph_customer_id` ON `purchase_histories` (`customer_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ph_shop_id` ON `purchase_histories` (`shop_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ph_tenant_customer_id` ON `purchase_histories` (`tenant_id`, `customer_id`);--> statement-breakpoint

