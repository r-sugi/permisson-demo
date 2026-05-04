import { sql } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const shopAssignments = sqliteTable('shop_assignments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  shopId: text('shop_id').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export type ShopAssignmentRow = typeof shopAssignments.$inferSelect
export type NewShopAssignmentRow = typeof shopAssignments.$inferInsert
