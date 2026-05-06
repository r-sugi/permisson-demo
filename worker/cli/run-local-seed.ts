import { ulid } from 'ulidx'
import { openDb } from './_db'
import { resetAllTables } from './_reset'
import { schema } from '../rdb/index'

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function seed() {
  const { sqlite, db } = openDb()

  resetAllTables(db)

  const pw = await hashPassword('password')

  const tenantA = 'tenant-a'
  const tenantB = 'tenant-b'

  db.insert(schema.tenants)
    .values([
      { id: tenantA, name: 'A社' },
      { id: tenantB, name: 'B社' },
    ])
    .run()

  db.insert(schema.subscriptions)
    .values([
      { id: 'sub-a', tenantId: tenantA, plan: 'pro', status: 'active' },
      { id: 'sub-b', tenantId: tenantB, plan: 'pro', status: 'active' },
    ])
    .run()

  const shopA1 = 'shop-a-shibuya'
  const shopA2 = 'shop-a-shinjuku'
  const shopB1 = 'shop-b-umeda'
  const shopB2 = 'shop-b-namba'

  db.insert(schema.shops)
    .values([
      { id: shopA1, tenantId: tenantA, name: 'A社 渋谷店' },
      { id: shopA2, tenantId: tenantA, name: 'A社 新宿店' },
      { id: shopB1, tenantId: tenantB, name: 'B社 梅田店' },
      { id: shopB2, tenantId: tenantB, name: 'B社 難波店' },
    ])
    .run()

  db.insert(schema.adminUsers)
    .values([
      {
        id: 'user-alice',
        email: 'alice@example.com',
        passwordHash: pw,
        tenantId: tenantA,
        role: 'tenant_owner',
        plan: 'pro',
      },
      {
        id: 'user-bob',
        email: 'bob@example.com',
        passwordHash: pw,
        tenantId: tenantA,
        role: 'tenant_staff',
        plan: 'pro',
      },
      {
        id: 'user-grace',
        email: 'grace@example.com',
        passwordHash: pw,
        tenantId: tenantA,
        role: 'shop_owner',
        plan: 'pro',
      },
      {
        id: 'user-henry',
        email: 'henry@example.com',
        passwordHash: pw,
        tenantId: tenantA,
        role: 'shop_staff',
        plan: 'pro',
      },
      {
        id: 'user-eve',
        email: 'eve@example.com',
        passwordHash: pw,
        tenantId: tenantA,
        role: 'tenant_owner',
        plan: 'basic',
      },
      {
        id: 'user-frank',
        email: 'frank@example.com',
        passwordHash: pw,
        tenantId: tenantA,
        role: 'tenant_staff',
        plan: 'basic',
      },
      {
        id: 'user-nora',
        email: 'nora@example.com',
        passwordHash: pw,
        tenantId: tenantA,
        role: 'shop_owner',
        plan: 'basic',
      },
      {
        id: 'user-oliver',
        email: 'oliver@example.com',
        passwordHash: pw,
        tenantId: tenantA,
        role: 'shop_staff',
        plan: 'basic',
      },
    ])
    .run()
  db.insert(schema.adminUsers)
    .values([
      {
        id: 'user-paul',
        email: 'paul@example.com',
        passwordHash: pw,
        tenantId: tenantA,
        role: 'tenant_owner',
        plan: 'starter',
      },
      {
        id: 'user-quinn',
        email: 'quinn@example.com',
        passwordHash: pw,
        tenantId: tenantA,
        role: 'tenant_staff',
        plan: 'starter',
      },
      {
        id: 'user-rachel',
        email: 'rachel@example.com',
        passwordHash: pw,
        tenantId: tenantA,
        role: 'shop_owner',
        plan: 'starter',
      },
      {
        id: 'user-sam',
        email: 'sam@example.com',
        passwordHash: pw,
        tenantId: tenantA,
        role: 'shop_staff',
        plan: 'starter',
      },
      {
        id: 'user-charlie',
        email: 'charlie@example.com',
        passwordHash: pw,
        tenantId: tenantB,
        role: 'tenant_owner',
        plan: 'basic',
      },
      {
        id: 'user-diana',
        email: 'diana@example.com',
        passwordHash: pw,
        tenantId: tenantB,
        role: 'tenant_staff',
        plan: 'basic',
      },
      {
        id: 'user-iris',
        email: 'iris@example.com',
        passwordHash: pw,
        tenantId: tenantB,
        role: 'shop_owner',
        plan: 'basic',
      },
      {
        id: 'user-jack',
        email: 'jack@example.com',
        passwordHash: pw,
        tenantId: tenantB,
        role: 'shop_staff',
        plan: 'basic',
      },
    ])
    .run()
  db.insert(schema.adminUsers)
    .values([
      {
        id: 'user-tom',
        email: 'tom@example.com',
        passwordHash: pw,
        tenantId: tenantB,
        role: 'tenant_owner',
        plan: 'pro',
      },
      {
        id: 'user-uma',
        email: 'uma@example.com',
        passwordHash: pw,
        tenantId: tenantB,
        role: 'tenant_staff',
        plan: 'pro',
      },
      {
        id: 'user-victor',
        email: 'victor@example.com',
        passwordHash: pw,
        tenantId: tenantB,
        role: 'shop_owner',
        plan: 'pro',
      },
      {
        id: 'user-wendy',
        email: 'wendy@example.com',
        passwordHash: pw,
        tenantId: tenantB,
        role: 'shop_staff',
        plan: 'pro',
      },
      {
        id: 'user-xavier',
        email: 'xavier@example.com',
        passwordHash: pw,
        tenantId: tenantB,
        role: 'tenant_owner',
        plan: 'starter',
      },
      {
        id: 'user-yara',
        email: 'yara@example.com',
        passwordHash: pw,
        tenantId: tenantB,
        role: 'tenant_staff',
        plan: 'starter',
      },
      {
        id: 'user-zoe',
        email: 'zoe@example.com',
        passwordHash: pw,
        tenantId: tenantB,
        role: 'shop_owner',
        plan: 'starter',
      },
      {
        id: 'user-alex',
        email: 'alex@example.com',
        passwordHash: pw,
        tenantId: tenantB,
        role: 'shop_staff',
        plan: 'starter',
      },
    ])
    .run()
  console.log('ユーザー 24 件を挿入しました')

  db.insert(schema.shopAssignments)
    .values([
      { id: 'sa-grace', userId: 'user-grace', shopId: shopA1 },
      { id: 'sa-henry', userId: 'user-henry', shopId: shopA1 },
      { id: 'sa-nora', userId: 'user-nora', shopId: shopA2 },
      { id: 'sa-oliver', userId: 'user-oliver', shopId: shopA2 },
      { id: 'sa-rachel', userId: 'user-rachel', shopId: shopA1 },
      { id: 'sa-sam', userId: 'user-sam', shopId: shopA1 },
      { id: 'sa-iris', userId: 'user-iris', shopId: shopB1 },
      { id: 'sa-jack', userId: 'user-jack', shopId: shopB1 },
      { id: 'sa-victor', userId: 'user-victor', shopId: shopB1 },
      { id: 'sa-wendy', userId: 'user-wendy', shopId: shopB1 },
      { id: 'sa-zoe', userId: 'user-zoe', shopId: shopB1 },
      { id: 'sa-alex', userId: 'user-alex', shopId: shopB1 },
    ])
    .run()

  const namedTemplates = [
    { name: '田中 一郎', email: 'tanaka1@example.com', tag: 'VIP', memo: 'A社常連' },
    { name: '佐藤 花子', email: 'sato@example.com', tag: null, memo: null },
    { name: '鈴木 太郎', email: 'suzuki@example.com', tag: 'リピーター', memo: null },
    { name: '高橋 美咲', email: 'takahashi@example.com', tag: null, memo: 'クーポン利用済み' },
    { name: '伊藤 さくら', email: 'ito@example.com', tag: 'VIP', memo: null },
    { name: '山本 浩介', email: 'yamamoto@example.com', tag: null, memo: null },
    { name: '中村 麻衣', email: 'nakamura@example.com', tag: null, memo: null },
    { name: '小林 悠介', email: 'kobayashi@example.com', tag: 'VIP', memo: 'B社常連' },
    { name: '加藤 のぞみ', email: 'kato@example.com', tag: null, memo: null },
    { name: '吉田 隼人', email: 'yoshida@example.com', tag: 'リピーター', memo: null },
    { name: '山田 あかり', email: 'yamada@example.com', tag: null, memo: null },
    { name: '松本 大輝', email: 'matsumoto@example.com', tag: null, memo: null },
    { name: '井上 莉奈', email: 'inoue@example.com', tag: null, memo: null },
    { name: '木村 直樹', email: 'kimura@example.com', tag: null, memo: null },
  ] as const

  const TOTAL_CUSTOMERS = 100_000
  const aShops = [shopA1, shopA2] as const
  const bShops = [shopB1, shopB2] as const
  const halfPoint = Math.floor(TOTAL_CUSTOMERS / 2)

  const shopIdForIndex = (i: number): string => {
    const pool = i < halfPoint ? aShops : bShops
    return pool[i % 2] ?? pool[0]
  }

  const namedRows = namedTemplates.map((row, i) => ({
    id: ulid(),
    name: row.name,
    email: row.email,
    tag: row.tag as string | null,
    memo: row.memo as string | null,
    shopId: shopIdForIndex(i),
  }))

  db.insert(schema.customers)
    .values(namedRows.map(({ shopId: _s, ...c }) => c))
    .run()
  db.insert(schema.purchaseHistories)
    .values(namedRows.map((r) => ({ id: ulid(), customerId: r.id, shopId: r.shopId })))
    .run()

  const CHUNK = 500
  const bulkStart = namedTemplates.length
  for (let i = bulkStart; i < TOTAL_CUSTOMERS; i += CHUNK) {
    const end = Math.min(i + CHUNK, TOTAL_CUSTOMERS)
    const customers = Array.from({ length: end - i }, (_, k) => ({
      id: ulid(),
      name: `顧客 ${i + k}`,
      email: `customer-${i + k}@example.com`,
      tag: null as string | null,
      memo: null as string | null,
    }))
    db.insert(schema.customers).values(customers).run()
    db.insert(schema.purchaseHistories)
      .values(
        customers.map((c, k) => ({ id: ulid(), customerId: c.id, shopId: shopIdForIndex(i + k) })),
      )
      .run()
    if ((i + CHUNK) % 100_000 === 0 || end === TOTAL_CUSTOMERS) {
      console.log(
        `  ${Math.min(i + CHUNK, TOTAL_CUSTOMERS).toLocaleString()} / ${TOTAL_CUSTOMERS.toLocaleString()} 件挿入中...`,
      )
    }
  }
  console.log(`顧客 ${TOTAL_CUSTOMERS.toLocaleString()} 件・購買履歴を挿入しました`)

  sqlite.close()
  console.log('シード完了')
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
