import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { schema } from '../rdb/index'

const D1_STATE_DIR = resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject')

export function findSqliteFile(): string {
  const files = readdirSync(D1_STATE_DIR).filter(
    (f) => f.endsWith('.sqlite') && !f.includes('-shm') && !f.includes('-wal'),
  )
  if (files.length === 0) {
    throw new Error(
      `D1 SQLite ファイルが見つかりません: ${D1_STATE_DIR}\n先に npm run db:migrate:local を実行してください`,
    )
  }
  return join(D1_STATE_DIR, files[0])
}

type SqliteHandle = InstanceType<typeof Database>
type AppDrizzleDb = ReturnType<typeof drizzle<typeof schema>>

export function openDb(): { sqlite: SqliteHandle; db: AppDrizzleDb } {
  const sqlitePath = findSqliteFile()
  console.log(`SQLite: ${sqlitePath}`)
  const sqlite = new Database(sqlitePath)
  const db = drizzle(sqlite, { schema })
  return { sqlite, db }
}
