import { sql } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { Plan } from '@shared/permission/types'

export const adminUsers = sqliteTable('admin_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  tenantId: text('tenant_id').notNull().default(''),
  role: text('role').notNull().default('shop_staff'),
  /** PBAC 用。同一テナント内でもデモ用に pro/basic/starter をユーザー単位で持てる */
  plan: text('plan').$type<Plan>().notNull().default('starter'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export type AdminUserRow = typeof adminUsers.$inferSelect
export type NewAdminUserRow = typeof adminUsers.$inferInsert
