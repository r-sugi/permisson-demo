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
  TEST_USER_KATE,
} from '../test/helpers'

describe('GET /api/shops - 店舗一覧', () => {
  beforeEach(() => resetDb())

  it('tenant_owner(S社): テナント内の全店舗2件', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/shops', token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as unknown[]
    expect(body).toHaveLength(2) // S社 渋谷店 + 新宿店
  })

  it('tenant_owner(S社): 店舗の customerCount 合計は /api/customers/summary と一致', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const shopsRes = await authedFetch('/api/shops', token)
    const shops = (await shopsRes.json()) as { customerCount: number }[]
    const sumShops = shops.reduce((acc, s) => acc + s.customerCount, 0)
    const sumRes = await authedFetch('/api/customers/summary', token)
    expect(sumRes.status).toBe(200)
    const { totalInScope } = (await sumRes.json()) as { totalInScope: number }
    expect(sumShops).toBe(totalInScope)
  })

  it('shop_owner(S社/渋谷店): 担当店舗のみ1件', async () => {
    const token = await createTestJwt(TEST_USER_GRACE, 'shop_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/shops', token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as unknown[]
    expect(body).toHaveLength(1)
  })

  it('shop_staff(S社/渋谷店): 担当店舗のみ1件', async () => {
    const token = await createTestJwt(TEST_USER_HENRY, 'shop_staff', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/shops', token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as unknown[]
    expect(body).toHaveLength(1)
  })

  it('tenant_owner(G社/starter): G社の店舗1件のみ', async () => {
    const token = await createTestJwt(TEST_USER_EVE, 'tenant_owner', TEST_TENANT_G_ID)
    const res = await authedFetch('/api/shops', token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as unknown[]
    expect(body).toHaveLength(1) // G社 博多店のみ
  })
})

describe('POST /api/tenants/:tenantId/shops - 店舗作成', () => {
  beforeEach(() => resetDb())

  it('tenant_owner(S社/pro): 201 で店舗作成成功', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedJsonFetch(`/api/tenants/${TEST_TENANT_S_ID}/shops`, token, 'POST', {
      name: '新店舗',
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; name: string }
    expect(body.name).toBe('新店舗')
  })

  it('shop_owner: 403 (settings.createShop = false)', async () => {
    const token = await createTestJwt(TEST_USER_GRACE, 'shop_owner', TEST_TENANT_S_ID)
    const res = await authedJsonFetch(`/api/tenants/${TEST_TENANT_S_ID}/shops`, token, 'POST', {
      name: '不正店舗',
    })
    expect(res.status).toBe(403)
  })

  it('shop_staff: 403 (settings.createShop = false)', async () => {
    const token = await createTestJwt(TEST_USER_HENRY, 'shop_staff', TEST_TENANT_S_ID)
    const res = await authedJsonFetch(`/api/tenants/${TEST_TENANT_S_ID}/shops`, token, 'POST', {
      name: '不正店舗',
    })
    expect(res.status).toBe(403)
  })

  it('tenant_owner: 別テナントIDでは 404 (ReBAC失敗)', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    // ALICE は S社のみ割り当て済みなので G社テナントへの操作は 404
    const res = await authedJsonFetch(`/api/tenants/${TEST_TENANT_G_ID}/shops`, token, 'POST', {
      name: 'クロステナント試行',
    })
    expect(res.status).toBe(404)
  })

  it('tenant_owner(G社): S社テナントURLへの POST は ReBAC で 404', async () => {
    const token = await createTestJwt(TEST_USER_EVE, 'tenant_owner', TEST_TENANT_G_ID)
    const res = await authedJsonFetch(`/api/tenants/${TEST_TENANT_S_ID}/shops`, token, 'POST', {
      name: 'GからSへ不正作成',
    })
    expect(res.status).toBe(404)
  })

  it('tenant_owner(G社/starter): starter上限5店なので作成可能', async () => {
    const token = await createTestJwt(TEST_USER_EVE, 'tenant_owner', TEST_TENANT_G_ID)
    const res = await authedJsonFetch(`/api/tenants/${TEST_TENANT_G_ID}/shops`, token, 'POST', {
      name: 'G社 追加店舗',
    })
    expect(res.status).toBe(201)
  })

  it('tenant_staff(S社/pro): 201 で店舗作成（PBAC は tenant_owner と同等）', async () => {
    const token = await createTestJwt(TEST_USER_BOB, 'tenant_staff', TEST_TENANT_S_ID)
    const res = await authedJsonFetch(`/api/tenants/${TEST_TENANT_S_ID}/shops`, token, 'POST', {
      name: 'Bob経由店舗',
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { name: string }
    expect(body.name).toBe('Bob経由店舗')
  })
})

describe('DELETE /api/tenants/:tenantId/shops/:shopId - 店舗削除', () => {
  beforeEach(() => resetDb())

  it('tenant_owner(S社): 200 で物理削除', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedFetch(
      `/api/tenants/${TEST_TENANT_S_ID}/shops/${TEST_SHOP_S1_ID}`,
      token,
      { method: 'DELETE' },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { shopId: string }
    expect(body.shopId).toBe(TEST_SHOP_S1_ID)

    // 削除後、一覧から消えていることを確認
    const listRes = await authedFetch('/api/shops', token)
    const shops = (await listRes.json()) as unknown[]
    expect(shops).toHaveLength(1) // 渋谷店が削除され新宿店のみ
  })

  it('shop_owner: 403 (settings.deleteShop = false)', async () => {
    const token = await createTestJwt(TEST_USER_GRACE, 'shop_owner', TEST_TENANT_S_ID)
    const res = await authedFetch(
      `/api/tenants/${TEST_TENANT_S_ID}/shops/${TEST_SHOP_S1_ID}`,
      token,
      { method: 'DELETE' },
    )
    expect(res.status).toBe(403)
  })

  it('shop_staff: 403 (settings.deleteShop = false)', async () => {
    const token = await createTestJwt(TEST_USER_HENRY, 'shop_staff', TEST_TENANT_S_ID)
    const res = await authedFetch(
      `/api/tenants/${TEST_TENANT_S_ID}/shops/${TEST_SHOP_S1_ID}`,
      token,
      { method: 'DELETE' },
    )
    expect(res.status).toBe(403)
  })

  it('shop_owner(G社): 他テナントのURLでは settings.deleteShop=false により 403 (PBAC)', async () => {
    const token = await createTestJwt(TEST_USER_KATE, 'shop_owner', TEST_TENANT_G_ID)
    const res = await authedFetch(
      `/api/tenants/${TEST_TENANT_S_ID}/shops/${TEST_SHOP_S1_ID}`,
      token,
      { method: 'DELETE' },
    )
    expect(res.status).toBe(403)
  })

  it('tenant_owner(G社): S社テナントIDでは ReBAC 不一致で 404', async () => {
    const token = await createTestJwt(TEST_USER_EVE, 'tenant_owner', TEST_TENANT_G_ID)
    const res = await authedFetch(
      `/api/tenants/${TEST_TENANT_S_ID}/shops/${TEST_SHOP_S1_ID}`,
      token,
      { method: 'DELETE' },
    )
    expect(res.status).toBe(404)
  })

  it('tenant_owner(S社): URL は自テナントだが shopId が他テナント店舗なら 404', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedFetch(
      `/api/tenants/${TEST_TENANT_S_ID}/shops/${TEST_SHOP_G1_ID}`,
      token,
      { method: 'DELETE' },
    )
    expect(res.status).toBe(404)
  })

  it('tenant_staff(S社): 200 で論理削除（PBAC・ReBAC ともに許可）', async () => {
    const token = await createTestJwt(TEST_USER_BOB, 'tenant_staff', TEST_TENANT_S_ID)
    const res = await authedFetch(`/api/tenants/${TEST_TENANT_S_ID}/shops/test-shop-s2`, token, {
      method: 'DELETE',
    })
    expect(res.status).toBe(200)
  })
})
