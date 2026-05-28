import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { schema } from '../rdb/index'
import { AuthContextRepository } from './auth-context.repository'

function makeDb() {
  const sqlite = new Database(':memory:')
  // 必要最小限のテーブルだけ作る（Drizzle の schema に合わせた列名）
  sqlite.exec(`
    CREATE TABLE admin_users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      role TEXT NOT NULL,
      plan TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE subscriptions (
      id TEXT PRIMARY KEY NOT NULL,
      tenant_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE shops (
      id TEXT PRIMARY KEY NOT NULL,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE shop_assignments (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      shop_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
  const db = drizzle(sqlite, { schema })
  return { sqlite, db }
}

describe('AuthContextRepository.tryAuthenticateUser', () => {
  it('tenant ロールは tenant の全 shopIds を返す', async () => {
    const { sqlite, db } = makeDb()
    try {
      await db.insert(schema.adminUsers).values({
        id: 'u1',
        email: 'u1@example.com',
        passwordHash: 'pw',
        tenantId: 't1',
        role: 'tenant_owner',
        plan: 'pro',
        createdAt: 'now',
      })
      await db.insert(schema.subscriptions).values({
        id: 'sub1',
        tenantId: 't1',
        plan: 'pro',
        status: 'active',
        createdAt: 'now',
      })
      await db.insert(schema.shops).values([
        { id: 's1', tenantId: 't1', name: 'S1', createdAt: 'now' },
        { id: 's2', tenantId: 't1', name: 'S2', createdAt: 'now' },
        { id: 'sX', tenantId: 'tX', name: 'SX', createdAt: 'now' },
      ])

      const repo = new AuthContextRepository(db as never)
      const out = await repo.tryAuthenticateUser('u1', 't1')
      expect(out).toMatchObject({ result: true })
      if (!out.result) throw new Error('unreachable')
      expect(out.shopIds.sort()).toEqual(['s1', 's2'])
    } finally {
      sqlite.close()
    }
  })

  it('shop ロールは割当済み shopIds のみ返す', async () => {
    const { sqlite, db } = makeDb()
    try {
      await db.insert(schema.adminUsers).values({
        id: 'u2',
        email: 'u2@example.com',
        passwordHash: 'pw',
        tenantId: 't1',
        role: 'shop_owner',
        plan: 'pro',
        createdAt: 'now',
      })
      await db.insert(schema.subscriptions).values({
        id: 'sub1',
        tenantId: 't1',
        plan: 'pro',
        status: 'active',
        createdAt: 'now',
      })
      await db.insert(schema.shops).values([
        { id: 's1', tenantId: 't1', name: 'S1', createdAt: 'now' },
        { id: 's2', tenantId: 't1', name: 'S2', createdAt: 'now' },
      ])
      await db.insert(schema.shopAssignments).values([
        { id: 'sa1', userId: 'u2', shopId: 's2', createdAt: 'now' },
      ])

      const repo = new AuthContextRepository(db as never)
      const out = await repo.tryAuthenticateUser('u2', 't1')
      expect(out).toMatchObject({ result: true })
      if (!out.result) throw new Error('unreachable')
      expect(out.shopIds).toEqual(['s2'])
    } finally {
      sqlite.close()
    }
  })
})

