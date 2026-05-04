import { drizzle } from 'drizzle-orm/d1'
import { schema } from '../rdb/index'

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>

export function createDatabaseConnection(db: D1Database): DrizzleDb {
  return drizzle(db, { schema })
}
