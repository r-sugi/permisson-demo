import { drizzle } from 'drizzle-orm/d1'
import { schema } from '../rdb/index'

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>

/** `db.transaction` の `tx` とルート `db` のいずれでも同一スキーマでクエリ可能 */
export type DrizzleTx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0]
export type DrizzleExecutor = DrizzleDb | DrizzleTx

export function createDatabaseConnection(db: D1Database): DrizzleDb {
  return drizzle(db, { schema })
}
