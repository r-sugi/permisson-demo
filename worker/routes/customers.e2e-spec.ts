import { beforeEach, describe, expect, it } from 'vitest'
import {
  authedFetch,
  authedJsonFetch,
  createTestJwt,
  resetDb,
  TEST_SHOP_G1_ID,
  TEST_SHOP_S1_ID,
  TEST_TENANT_G_ID,
  TEST_TENANT_S_ID,
  TEST_USER_ALICE,
  TEST_USER_BOB,
  TEST_USER_EVE,
  TEST_USER_GRACE,
  TEST_USER_HENRY,
  TEST_USER_IRIS,
} from '../test/helpers'

/** authorize の PBAC 403 本文（JSON またはプレーンテキスト） */
async function expectPermissionDenied(res: Response, expectedSuffix: string) {
  expect(res.status).toBe(403)
  const raw = await res.text()
  const message = (() => {
    try {
      const j = JSON.parse(raw) as { message?: string }
      return j.message ?? raw
    } catch {
      return raw
    }
  })()
  expect(message).toContain(`Permission denied: ${expectedSuffix}`)
}

type CustomerListJson = { items: { id: string }[]; nextCursor: string | null }

describe('GET /api/customers - スコープ解決', () => {
  beforeEach(() => resetDb())

  it('tenant_owner(S社/pro): 1ページ目は20件・次ページあり（スコープ内は万件規模のバルクを含む）', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers', token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as CustomerListJson
    expect(body.items).toHaveLength(20)
    expect(body.nextCursor).not.toBeNull()
  })

  it('tenant_staff(S社/pro): tenant_owner と同様にページネーション応答', async () => {
    const token = await createTestJwt(TEST_USER_BOB, 'tenant_staff', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers', token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as CustomerListJson
    expect(body.items).toHaveLength(20)
    expect(body.nextCursor).not.toBeNull()
  })

  it('shop_owner(S社/渋谷店/pro): 担当店舗スコープで1ページ目20件・次ページあり', async () => {
    const token = await createTestJwt(TEST_USER_GRACE, 'shop_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers', token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as CustomerListJson
    expect(body.items).toHaveLength(20)
    expect(body.nextCursor).not.toBeNull()
  })

  it('shop_staff: 403 (customer.read = false)', async () => {
    const token = await createTestJwt(TEST_USER_HENRY, 'shop_staff', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers', token)
    await expectPermissionDenied(res, 'customer.read')
  })

  it('tenant_owner(G社/starter): 別テナントの顧客1件のみ（次ページなし）', async () => {
    const token = await createTestJwt(TEST_USER_EVE, 'tenant_owner', TEST_TENANT_G_ID)
    const res = await authedFetch('/api/customers', token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as CustomerListJson
    expect(body.items).toHaveLength(1)
    expect(body.items[0]?.id).toBe('cust-g1-1')
    expect(body.nextCursor).toBeNull()
  })

  it('401: JWTなしで認証エラー', async () => {
    const res = await authedFetch('/api/customers', '')
    expect(res.status).toBe(401)
  })

  it('tenant_owner(S社/pro): 2ページ目も取得でき、IDが重複しない', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res1 = await authedFetch('/api/customers?limit=20', token)
    expect(res1.status).toBe(200)
    const body1 = (await res1.json()) as CustomerListJson
    expect(body1.items).toHaveLength(20)
    expect(body1.nextCursor).not.toBeNull()

    const res2 = await authedFetch(`/api/customers?limit=20&cursor=${body1.nextCursor}`, token)
    expect(res2.status).toBe(200)
    const body2 = (await res2.json()) as CustomerListJson
    expect(body2.items).toHaveLength(20)

    const ids1 = new Set(body1.items.map((i) => i.id))
    for (const i of body2.items) {
      expect(ids1.has(i.id)).toBe(false)
    }
  })

  it('400: バリデーションエラー（limit=0）', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers?limit=0', token)
    expect(res.status).toBe(400)
  })

  it('400: バリデーションエラー（limit=101）', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers?limit=101', token)
    expect(res.status).toBe(400)
  })

  it('400: バリデーションエラー（cursor=""）', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers?cursor=', token)
    expect(res.status).toBe(400)
  })
})

describe('GET /api/customers/summary - スコープ内件数', () => {
  beforeEach(() => resetDb())

  it('tenant_owner(S社/pro): totalInScope は一覧スコープと一致する総件数', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers/summary', token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { totalInScope: number }
    expect(body.totalInScope).toBe(9997)
  })

  it('tenant_owner(G社/starter): totalInScope は 1', async () => {
    const token = await createTestJwt(TEST_USER_EVE, 'tenant_owner', TEST_TENANT_G_ID)
    const res = await authedFetch('/api/customers/summary', token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { totalInScope: number }
    expect(body.totalInScope).toBe(1)
  })

  it('shop_staff: 403 (customer.read = false)', async () => {
    const token = await createTestJwt(TEST_USER_HENRY, 'shop_staff', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers/summary', token)
    await expectPermissionDenied(res, 'customer.read')
  })
})

describe('POST /api/customers - 顧客作成', () => {
  beforeEach(() => resetDb())

  it('tenant_owner: 201 で顧客を作成できる', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedJsonFetch('/api/customers', token, 'POST', {
      name: '新規顧客',
      email: 'newcust@test.com',
      shopId: TEST_SHOP_S1_ID,
      tag: 'NEW',
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; name: string }
    expect(body.name).toBe('新規顧客')
    expect(body.id).toBeTruthy()
  })

  it('shop_owner: 403 (customer.create = false)', async () => {
    const token = await createTestJwt(TEST_USER_GRACE, 'shop_owner', TEST_TENANT_S_ID)
    const res = await authedJsonFetch('/api/customers', token, 'POST', {
      name: '不正作成',
      email: 'illegal@test.com',
    })
    await expectPermissionDenied(res, 'customer.create')
  })

  it('shop_staff: 403 (customer.create = false)', async () => {
    const token = await createTestJwt(TEST_USER_HENRY, 'shop_staff', TEST_TENANT_S_ID)
    const res = await authedJsonFetch('/api/customers', token, 'POST', {
      name: '不正作成',
      email: 'illegal2@test.com',
    })
    expect(res.status).toBe(403)
  })

  it('400: バリデーションエラー（email不正）', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedJsonFetch('/api/customers', token, 'POST', {
      name: 'テスト',
      email: 'not-email',
      shopId: TEST_SHOP_S1_ID,
    })
    expect(res.status).toBe(400)
  })

  it('tenant_staff: 201 で顧客を作成できる（PBAC は tenant_owner と同等）', async () => {
    const token = await createTestJwt(TEST_USER_BOB, 'tenant_staff', TEST_TENANT_S_ID)
    const res = await authedJsonFetch('/api/customers', token, 'POST', {
      name: 'Bob経由顧客',
      email: 'bobcust@test.com',
      shopId: TEST_SHOP_S1_ID,
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; name: string }
    expect(body.name).toBe('Bob経由顧客')
  })

  it('tenant_owner(S社): 他テナント店舗の shopId では ReBAC で 404', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedJsonFetch('/api/customers', token, 'POST', {
      name: '越境作成',
      email: 'cross@test.com',
      shopId: TEST_SHOP_G1_ID,
    })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/customers/:id - 顧客更新', () => {
  beforeEach(() => resetDb())

  it('tenant_owner: 200 でスコープ内顧客を更新', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedJsonFetch('/api/customers/cust-s1-1', token, 'PATCH', {
      name: '田中一郎（更新済み）',
      tag: 'UPDATED',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string; tag: string }
    expect(body.name).toBe('田中一郎（更新済み）')
    expect(body.tag).toBe('UPDATED')
  })

  it('shop_owner: 200 で担当店舗の顧客を更新', async () => {
    const token = await createTestJwt(TEST_USER_GRACE, 'shop_owner', TEST_TENANT_S_ID)
    const res = await authedJsonFetch('/api/customers/cust-s1-1', token, 'PATCH', {
      name: 'Grace更新',
    })
    expect(res.status).toBe(200)
  })

  it('shop_owner: 404 で担当外店舗の顧客は更新できない', async () => {
    const token = await createTestJwt(TEST_USER_GRACE, 'shop_owner', TEST_TENANT_S_ID)
    // cust-f1-1はF社の顧客 → shopS1のスコープ外
    const res = await authedJsonFetch('/api/customers/cust-f1-1', token, 'PATCH', {
      name: '不正更新',
    })
    expect(res.status).toBe(404)
  })

  it('shop_staff: 403 (customer.update = false)', async () => {
    const token = await createTestJwt(TEST_USER_HENRY, 'shop_staff', TEST_TENANT_S_ID)
    const res = await authedJsonFetch('/api/customers/cust-s1-1', token, 'PATCH', {
      name: '不正更新',
    })
    await expectPermissionDenied(res, 'customer.update')
  })

  it('tenant_staff: 200 でスコープ内顧客を更新', async () => {
    const token = await createTestJwt(TEST_USER_BOB, 'tenant_staff', TEST_TENANT_S_ID)
    const res = await authedJsonFetch('/api/customers/cust-s1-1', token, 'PATCH', {
      name: 'Bob更新',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string }
    expect(body.name).toBe('Bob更新')
  })

  it('tenant_owner: 別テナント顧客は ReBAC（またはリポジトリ）で 404', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedJsonFetch('/api/customers/cust-g1-1', token, 'PATCH', {
      name: '越境更新',
    })
    expect(res.status).toBe(404)
  })

  it('400: バリデーションエラー（name が 101 文字）', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedJsonFetch('/api/customers/cust-s1-1', token, 'PATCH', {
      name: 'a'.repeat(101),
    })
    expect(res.status).toBe(400)
  })

  it('404: 存在しない顧客IDは 404', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedJsonFetch('/api/customers/cust-not-exist', token, 'PATCH', {
      name: '更新試行',
    })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/customers/:id - 顧客削除', () => {
  beforeEach(() => resetDb())

  it('tenant_owner: 200 で削除', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers/cust-s1-1', token, { method: 'DELETE' })
    expect(res.status).toBe(200)
  })

  it('shop_owner: 403 (customer.delete = false)', async () => {
    const token = await createTestJwt(TEST_USER_GRACE, 'shop_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers/cust-s1-1', token, { method: 'DELETE' })
    expect(res.status).toBe(403)
  })

  it('shop_staff: 403 (customer.delete = false)', async () => {
    const token = await createTestJwt(TEST_USER_HENRY, 'shop_staff', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers/cust-s1-1', token, { method: 'DELETE' })
    await expectPermissionDenied(res, 'customer.delete')
  })

  it('tenant_staff: 200 で削除', async () => {
    const token = await createTestJwt(TEST_USER_BOB, 'tenant_staff', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers/cust-s2-1', token, { method: 'DELETE' })
    expect(res.status).toBe(200)
  })

  it('404: 存在しない顧客IDは 404', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers/cust-not-exist', token, { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/customers/export - CSVエクスポート', () => {
  beforeEach(() => resetDb())

  it('tenant_owner(pro): 200 でエクスポート成功（無制限）', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers/export', token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { customers: unknown[]; count: number }
    expect(body.customers).toBeDefined()
    expect(body.count).toBeGreaterThan(0)
  })

  it('tenant_owner(starter): 403 (customer.exportCsv = false)', async () => {
    const token = await createTestJwt(TEST_USER_EVE, 'tenant_owner', TEST_TENANT_G_ID)
    const res = await authedFetch('/api/customers/export', token)
    await expectPermissionDenied(res, 'customer.exportCsv')
  })

  it('shop_staff: 403 (customer.exportCsv = false)', async () => {
    const token = await createTestJwt(TEST_USER_HENRY, 'shop_staff', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers/export', token)
    expect(res.status).toBe(403)
  })

  it('shop_owner(F社/basic): 200 でエクスポート成功（月100件）', async () => {
    const token = await createTestJwt(TEST_USER_IRIS, 'shop_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers/export', token)
    expect(res.status).toBe(200)
  })

  it('tenant_staff(pro): 200 でエクスポート成功', async () => {
    const token = await createTestJwt(TEST_USER_BOB, 'tenant_staff', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/customers/export', token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { count: number }
    expect(body.count).toBeGreaterThan(0)
  })
})
