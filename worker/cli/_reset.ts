import type { drizzle } from 'drizzle-orm/better-sqlite3'
import { schema } from '../rdb/index'

type Db = ReturnType<typeof drizzle<typeof schema>>

export function resetAllTables(db: Db) {
  db.delete(schema.purchaseHistories).run()
  db.delete(schema.shopAssignments).run()
  db.delete(schema.customers).run()
  db.delete(schema.shops).run()
  db.delete(schema.subscriptions).run()
  db.delete(schema.tenants).run()
  db.delete(schema.adminUsers).run()
  console.log('全テーブルをクリアしました')
}
