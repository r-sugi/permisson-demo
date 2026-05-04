import { sql } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const adminUsers = sqliteTable('admin_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  tenantId: text('tenant_id').notNull().default(''),
  role: text('role').notNull().default('shop_staff'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export type AdminUserRow = typeof adminUsers.$inferSelect
export type NewAdminUserRow = typeof adminUsers.$inferInsert
