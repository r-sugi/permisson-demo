import { describe, it, expect } from 'vitest'
import type { AuthContext } from '../types'
import { TenantId, ShopId } from '../types'
import type { Repositories } from './resolver-types'
import {
  resolveTenantAssignment,
  resolveShopAssignment,
  resolveShopViaTenant,
  resolveCustomerViaShop,
} from './resolvers'
import { useResolver } from './resolver-map'

const auth = (overrides: Partial<AuthContext> = {}): AuthContext => ({
  userId: 'user-1',
  tenantId: 'tenant-a',
  role: 'shop_owner',
  plan: 'pro',
  ...overrides,
})

function mockRepos(partial: Partial<Repositories>): Repositories {
  return {
    shopAssignment: {
      findByUserIdAndShopId: async () => null,
    },
    shop: {
      findById: async () => null,
    },
    purchaseHistory: {
      findByCustomerId: async () => null,
    },
    ...partial,
  }
}

describe('resolveTenantAssignment', () => {
  it('tenantId が一致すれば true', async () => {
    const r = resolveTenantAssignment(TenantId('tenant-a'))
    expect(await r(mockRepos({}), auth({ tenantId: 'tenant-a' }))).toBe(true)
  })

  it('tenantId が一致しなければ false', async () => {
    const r = resolveTenantAssignment(TenantId('tenant-b'))
    expect(await r(mockRepos({}), auth({ tenantId: 'tenant-a' }))).toBe(false)
  })
})

describe('resolveShopAssignment', () => {
  it('assignment があれば true', async () => {
    const r = resolveShopAssignment(ShopId('shop-1'))
    const repo = mockRepos({
      shopAssignment: {
        findByUserIdAndShopId: async (uid, sid) =>
          uid === 'user-1' && sid === 'shop-1' ? { userId: uid, shopId: sid } : null,
      },
    })
    expect(await r(repo, auth())).toBe(true)
  })

  it('assignment が null なら false', async () => {
    const r = resolveShopAssignment(ShopId('shop-1'))
    expect(await r(mockRepos({}), auth())).toBe(false)
  })
})

describe('resolveShopViaTenant', () => {
  it('店舗があり未削除でテナント一致なら true', async () => {
    const r = resolveShopViaTenant(ShopId('shop-1'))
    const repo = mockRepos({
      shop: {
        findById: async () => ({ tenantId: 'tenant-a', deletedAt: null }),
      },
    })
    expect(await r(repo, auth({ tenantId: 'tenant-a' }))).toBe(true)
  })

  it('店舗がなければ false', async () => {
    const r = resolveShopViaTenant(ShopId('shop-x'))
    const repo = mockRepos({
      shop: { findById: async () => null },
    })
    expect(await r(repo, auth())).toBe(false)
  })

  it('deletedAt がありなら false', async () => {
    const r = resolveShopViaTenant(ShopId('shop-1'))
    const repo = mockRepos({
      shop: {
        findById: async () => ({ tenantId: 'tenant-a', deletedAt: '2025-01-01' }),
      },
    })
    expect(await r(repo, auth({ tenantId: 'tenant-a' }))).toBe(false)
  })

  it('テナントが不一致なら false', async () => {
    const r = resolveShopViaTenant(ShopId('shop-1'))
    const repo = mockRepos({
      shop: {
        findById: async () => ({ tenantId: 'tenant-b', deletedAt: null }),
      },
    })
    expect(await r(repo, auth({ tenantId: 'tenant-a' }))).toBe(false)
  })
})

describe('resolveCustomerViaShop', () => {
  it('purchaseHistory と assignment が繋がれば true', async () => {
    const r = resolveCustomerViaShop('cust-1')
    const repo = mockRepos({
      purchaseHistory: {
        findByCustomerId: async () => ({ shopId: 'shop-1' }),
      },
      shopAssignment: {
        findByUserIdAndShopId: async (uid, sid) =>
          uid === 'user-1' && sid === 'shop-1' ? { userId: uid, shopId: sid } : null,
      },
    })
    expect(await r(repo, auth())).toBe(true)
  })

  it('purchaseHistory がなければ false', async () => {
    const r = resolveCustomerViaShop('cust-x')
    expect(await r(mockRepos({}), auth())).toBe(false)
  })

  it('assignment がなければ false', async () => {
    const r = resolveCustomerViaShop('cust-1')
    const repo = mockRepos({
      purchaseHistory: {
        findByCustomerId: async () => ({ shopId: 'shop-1' }),
      },
    })
    expect(await r(repo, auth())).toBe(false)
  })
})

describe('useResolver', () => {
  it('tenant キーで resolveTenantAssignment と同等に動く', async () => {
    const r = useResolver('tenant', { tenantId: TenantId('tenant-a') })
    expect(await r(mockRepos({}), auth({ tenantId: 'tenant-a' }))).toBe(true)
    expect(await r(mockRepos({}), auth({ tenantId: 'tenant-b' }))).toBe(false)
  })
})
