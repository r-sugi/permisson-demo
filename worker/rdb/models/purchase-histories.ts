import { sql } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { shops } from './shops'

export const purchaseHistories = sqliteTable('purchase_histories', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull(),
  shopId: text('shop_id')
    .notNull()
    .references(() => shops.id, { onDelete: 'cascade' }),
  purchasedAt: text('purchased_at').notNull().default(sql`(datetime('now'))`),
})

export type PurchaseHistoryRow = typeof purchaseHistories.$inferSelect
export type NewPurchaseHistoryRow = typeof purchaseHistories.$inferInsert
