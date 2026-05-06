import { drizzle } from 'drizzle-orm/d1'
import { schema } from '../rdb/index'
import { wrapD1ForSqlTiming } from './d1-sql-timing-proxy'

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>

/** `db.transaction` の `tx` とルート `db` のいずれでも同一スキーマでクエリ可能 */
export type DrizzleTx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0]
export type DrizzleExecutor = DrizzleDb | DrizzleTx

function isProductionNodeEnv(): boolean {
  const g = globalThis as typeof globalThis & { process?: { env?: { NODE_ENV?: string } } }
  return g.process?.env?.NODE_ENV === 'production'
}

export function createDatabaseConnection(db: D1Database): DrizzleDb {
  const client = isProductionNodeEnv() ? db : wrapD1ForSqlTiming(db)
  return drizzle(client, { schema })
}
