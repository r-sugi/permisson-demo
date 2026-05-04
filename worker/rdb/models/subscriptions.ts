import { sql } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  plan: text('plan').$type<'starter' | 'basic' | 'pro'>().notNull().default('starter'),
  status: text('status').$type<'active' | 'inactive'>().notNull().default('active'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export type SubscriptionRow = typeof subscriptions.$inferSelect
export type NewSubscriptionRow = typeof subscriptions.$inferInsert
