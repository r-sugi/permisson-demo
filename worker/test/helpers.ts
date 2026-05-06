import { env, SELF } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { sign } from 'hono/jwt'
import { ulid } from 'ulidx'
import { schema } from '../rdb/index'
import type { Role } from '@shared/permission/types'

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────
export const TEST_JWT_SECRET = 'test-secret-do-not-use-in-production'
export const TEST_TENANT_S_ID = 'test-tenant-s'
export const TEST_TENANT_F_ID = 'test-tenant-f'
export const TEST_TENANT_G_ID = 'test-tenant-g'
export const TEST_SHOP_S1_ID = 'test-shop-s1'
export const TEST_SHOP_F1_ID = 'test-shop-f1'
export const TEST_SHOP_G1_ID = 'test-shop-g1'
export const TEST_USER_ALICE = 'test-alice' // tenant_owner × S社 (pro)
export const TEST_USER_BOB = 'test-bob' // tenant_staff × S社 (pro)
export const TEST_USER_EVE = 'test-eve' // tenant_owner × G社 (starter)
export const TEST_USER_GRACE = 'test-grace' // shop_owner × S社/shopS1 (pro)
export const TEST_USER_HENRY = 'test-henry' // shop_staff × S社/shopS1 (pro)
export const TEST_USER_IRIS = 'test-iris' // shop_owner × F社/shopF1 (basic)
export const TEST_USER_KATE = 'test-kate' // shop_owner × G社/shopG1 (starter)

// ─────────────────────────────────────────────
// DB ヘルパー
// ─────────────────────────────────────────────
export function getDb() {
  return drizzle((env as typeof env & { DB: D1Database }).DB, { schema })
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 全テーブルをクリアしてテスト用の最小シードデータを挿入する
 */
export async function resetDb() {
  const db = getDb()

  // FK制約順（子→親）でクリア
  await db.delete(schema.purchaseHistories).run()
  await db.delete(schema.shopAssignments).run()
  await db.delete(schema.customers).run()
  await db.delete(schema.shops).run()
  await db.delete(schema.subscriptions).run()
  await db.delete(schema.tenants).run()
  await db.delete(schema.adminUsers).run()

  const pw = await hashPassword('password')

  // テナント
  await db
    .insert(schema.tenants)
    .values([
      { id: TEST_TENANT_S_ID, name: 'テナントS社' },
      { id: TEST_TENANT_F_ID, name: 'テナントF社' },
      { id: TEST_TENANT_G_ID, name: 'テナントG社' },
    ])
    .run()

  // サブスクリプション
  await db
    .insert(schema.subscriptions)
    .values([
      { id: 'sub-s', tenantId: TEST_TENANT_S_ID, plan: 'pro', status: 'active' },
      { id: 'sub-f', tenantId: TEST_TENANT_F_ID, plan: 'basic', status: 'active' },
      { id: 'sub-g', tenantId: TEST_TENANT_G_ID, plan: 'starter', status: 'active' },
    ])
    .run()

  // 店舗
  await db
    .insert(schema.shops)
    .values([
      { id: TEST_SHOP_S1_ID, tenantId: TEST_TENANT_S_ID, name: 'S社 渋谷店' },
      { id: 'test-shop-s2', tenantId: TEST_TENANT_S_ID, name: 'S社 新宿店' },
      { id: TEST_SHOP_F1_ID, tenantId: TEST_TENANT_F_ID, name: 'F社 梅田店' },
      { id: 'test-shop-f2', tenantId: TEST_TENANT_F_ID, name: 'F社 難波店' },
      { id: TEST_SHOP_G1_ID, tenantId: TEST_TENANT_G_ID, name: 'G社 博多店' },
    ])
    .run()

  // ユーザー（role と tenantId を adminUsers に直接格納）
  await db
    .insert(schema.adminUsers)
    .values([
      {
        id: TEST_USER_ALICE,
        email: 'alice@test.com',
        passwordHash: pw,
        tenantId: TEST_TENANT_S_ID,
        role: 'tenant_owner',
      },
      {
        id: TEST_USER_BOB,
        email: 'bob@test.com',
        passwordHash: pw,
        tenantId: TEST_TENANT_S_ID,
        role: 'tenant_staff',
      },
      {
        id: TEST_USER_EVE,
        email: 'eve@test.com',
        passwordHash: pw,
        tenantId: TEST_TENANT_G_ID,
        role: 'tenant_owner',
      },
      {
        id: TEST_USER_GRACE,
        email: 'grace@test.com',
        passwordHash: pw,
        tenantId: TEST_TENANT_S_ID,
        role: 'shop_owner',
      },
      {
        id: TEST_USER_HENRY,
        email: 'henry@test.com',
        passwordHash: pw,
        tenantId: TEST_TENANT_S_ID,
        role: 'shop_staff',
      },
      {
        id: TEST_USER_IRIS,
        email: 'iris@test.com',
        passwordHash: pw,
        tenantId: TEST_TENANT_F_ID,
        role: 'shop_owner',
      },
      {
        id: TEST_USER_KATE,
        email: 'kate@test.com',
        passwordHash: pw,
        tenantId: TEST_TENANT_G_ID,
        role: 'shop_owner',
      },
    ])
    .run()

  // shop_assignments（role は adminUsers で管理するため不要）
  await db
    .insert(schema.shopAssignments)
    .values([
      { id: 'sa-grace', userId: TEST_USER_GRACE, shopId: TEST_SHOP_S1_ID },
      { id: 'sa-henry', userId: TEST_USER_HENRY, shopId: TEST_SHOP_S1_ID },
      { id: 'sa-iris', userId: TEST_USER_IRIS, shopId: TEST_SHOP_F1_ID },
      { id: 'sa-kate', userId: TEST_USER_KATE, shopId: TEST_SHOP_G1_ID },
    ])
    .run()

  // 顧客（固定6件 + バルクで合計 10,000）+ purchase_histories
  const fixtureCustomers = [
    {
      id: 'cust-s1-1',
      name: '田中一郎',
      email: 'tanaka@test.com',
      tag: 'VIP',
      memo: null as string | null,
    },
    {
      id: 'cust-s1-2',
      name: '佐藤花子',
      email: 'sato@test.com',
      tag: null,
      memo: null as string | null,
    },
    {
      id: 'cust-s2-1',
      name: '鈴木太郎',
      email: 'suzuki@test.com',
      tag: null,
      memo: null as string | null,
    },
    {
      id: 'cust-f1-1',
      name: '伊藤さくら',
      email: 'ito@test.com',
      tag: 'VIP',
      memo: null as string | null,
    },
    {
      id: 'cust-f1-2',
      name: '山本浩介',
      email: 'yamamoto@test.com',
      tag: null,
      memo: null as string | null,
    },
    {
      id: 'cust-g1-1',
      name: '小林悠介',
      email: 'kobayashi@test.com',
      tag: null,
      memo: null as string | null,
    },
  ] as const

  const BULK_TOTAL = 10_000 - fixtureCustomers.length
  const sShops = [TEST_SHOP_S1_ID, 'test-shop-s2'] as const
  const bulkCustomers = Array.from({ length: BULK_TOTAL }, (_, i) => ({
    id: ulid(),
    name: `バルク顧客${i}`,
    email: `bulk-${i}@test.com`,
    tag: null as string | null,
    memo: null as string | null,
  }))

  /** D1 はステートメントあたり ~100 バインド程度（customers は実質 5 列×行） */
  const CUSTOMER_INSERT_CHUNK = 20
  for (let i = 0; i < bulkCustomers.length; i += CUSTOMER_INSERT_CHUNK) {
    await db
      .insert(schema.customers)
      .values(bulkCustomers.slice(i, i + CUSTOMER_INSERT_CHUNK))
      .run()
  }
  await db
    .insert(schema.customers)
    .values([...fixtureCustomers])
    .run()

  const fixturePh = [
    { id: 'ph-1', customerId: 'cust-s1-1', shopId: TEST_SHOP_S1_ID },
    { id: 'ph-2', customerId: 'cust-s1-2', shopId: TEST_SHOP_S1_ID },
    { id: 'ph-3', customerId: 'cust-s2-1', shopId: 'test-shop-s2' },
    { id: 'ph-4', customerId: 'cust-f1-1', shopId: TEST_SHOP_F1_ID },
    { id: 'ph-5', customerId: 'cust-f1-2', shopId: TEST_SHOP_F1_ID },
    { id: 'ph-6', customerId: 'cust-g1-1', shopId: TEST_SHOP_G1_ID },
  ]
  const bulkPh = bulkCustomers.map((c, i) => {
    const shopId = sShops[i % sShops.length]
    if (shopId === undefined) throw new Error('sShops is empty')
    return {
      id: ulid(),
      customerId: c.id,
      shopId,
    }
  })
  const PH_INSERT_CHUNK = 30
  for (let i = 0; i < bulkPh.length; i += PH_INSERT_CHUNK) {
    await db
      .insert(schema.purchaseHistories)
      .values(bulkPh.slice(i, i + PH_INSERT_CHUNK))
      .run()
  }
  await db.insert(schema.purchaseHistories).values(fixturePh).run()

  return db
}

// ─────────────────────────────────────────────
// JWT ヘルパー
// ─────────────────────────────────────────────
export async function createTestJwt(userId: string, role: Role, tenantId: string): Promise<string> {
  return sign({ sub: userId, role, tenantId }, TEST_JWT_SECRET, 'HS256')
}

// ─────────────────────────────────────────────
// HTTP ヘルパー
// ─────────────────────────────────────────────
export function authedFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  return SELF.fetch(`http://localhost${path}`, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
}

export function authedJsonFetch(
  path: string,
  token: string,
  method: string,
  body: unknown,
): Promise<Response> {
  return authedFetch(path, token, { method, body: JSON.stringify(body) })
}
