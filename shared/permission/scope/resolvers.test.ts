import { describe, it, expect } from 'vitest'
import type { AuthContext } from '@shared/permission/types'
import { TenantId, ShopId } from '@shared/permission/types'
import type { Repositories } from './resolver-types'
import {
  resolveTenantAssignment,
  resolveShopAssignment,
  resolveShopViaTenant,
  resolveCustomerViaShop,
  resolveShopInTenantContext,
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
  it('店舗がありテナント一致なら true', async () => {
    const r = resolveShopViaTenant(ShopId('shop-1'))
    const repo = mockRepos({
      shop: {
        findById: async () => ({ tenantId: 'tenant-a' }),
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

  it('テナントが不一致なら false', async () => {
    const r = resolveShopViaTenant(ShopId('shop-1'))
    const repo = mockRepos({
      shop: {
        findById: async () => ({ tenantId: 'tenant-b' }),
      },
    })
    expect(await r(repo, auth({ tenantId: 'tenant-a' }))).toBe(false)
  })
})

describe('resolveCustomerViaShop', () => {
  it('shop ロール: purchaseHistory と assignment が繋がれば true', async () => {
    const r = resolveCustomerViaShop('cust-1')
    const repo = mockRepos({
      purchaseHistory: {
        findByCustomerId: async () => ({ shopId: 'shop-1' }),
      },
      shop: {
        findById: async () => ({ tenantId: 'tenant-a' }),
      },
      shopAssignment: {
        findByUserIdAndShopId: async (uid, sid) =>
          uid === 'user-1' && sid === 'shop-1' ? { userId: uid, shopId: sid } : null,
      },
    })
    expect(await r(repo, auth({ role: 'shop_owner' }))).toBe(true)
  })

  it('テナントロール: assignment なしでも当該テナントの店舗なら true', async () => {
    const r = resolveCustomerViaShop('cust-1')
    const repo = mockRepos({
      purchaseHistory: {
        findByCustomerId: async () => ({ shopId: 'shop-1' }),
      },
      shop: {
        findById: async () => ({ tenantId: 'tenant-a' }),
      },
    })
    expect(await r(repo, auth({ role: 'tenant_owner', tenantId: 'tenant-a' }))).toBe(true)
  })

  it('テナントロール: 他テナントの店舗に紐づく顧客は false', async () => {
    const r = resolveCustomerViaShop('cust-1')
    const repo = mockRepos({
      purchaseHistory: {
        findByCustomerId: async () => ({ shopId: 'shop-1' }),
      },
      shop: {
        findById: async () => ({ tenantId: 'tenant-b' }),
      },
    })
    expect(await r(repo, auth({ role: 'tenant_owner', tenantId: 'tenant-a' }))).toBe(false)
  })

  it('purchaseHistory がなければ false', async () => {
    const r = resolveCustomerViaShop('cust-x')
    expect(await r(mockRepos({}), auth())).toBe(false)
  })

  it('店舗レコードがなければ false（例: 物理削除済み）', async () => {
    const r = resolveCustomerViaShop('cust-1')
    const repo = mockRepos({
      purchaseHistory: {
        findByCustomerId: async () => ({ shopId: 'shop-1' }),
      },
      shop: { findById: async () => null },
    })
    expect(await r(repo, auth({ role: 'tenant_owner', tenantId: 'tenant-a' }))).toBe(false)
  })

  it('shop ロール: assignment がなければ false', async () => {
    const r = resolveCustomerViaShop('cust-1')
    const repo = mockRepos({
      purchaseHistory: {
        findByCustomerId: async () => ({ shopId: 'shop-1' }),
      },
      shop: {
        findById: async () => ({ tenantId: 'tenant-a' }),
      },
    })
    expect(await r(repo, auth({ role: 'shop_owner' }))).toBe(false)
  })
})

describe('resolveShopInTenantContext', () => {
  it('URL tenant・JWT・店舗のテナントが揃えば true', async () => {
    const r = resolveShopInTenantContext(TenantId('tenant-a'), ShopId('shop-1'))
    const repo = mockRepos({
      shop: {
        findById: async () => ({ tenantId: 'tenant-a' }),
      },
    })
    expect(await r(repo, auth({ tenantId: 'tenant-a' }))).toBe(true)
  })

  it('URL tenant が JWT と不一致なら false', async () => {
    const r = resolveShopInTenantContext(TenantId('tenant-b'), ShopId('shop-1'))
    const repo = mockRepos({
      shop: {
        findById: async () => ({ tenantId: 'tenant-b' }),
      },
    })
    expect(await r(repo, auth({ tenantId: 'tenant-a' }))).toBe(false)
  })

  it('店舗が別テナントなら false', async () => {
    const r = resolveShopInTenantContext(TenantId('tenant-a'), ShopId('shop-1'))
    const repo = mockRepos({
      shop: {
        findById: async () => ({ tenantId: 'tenant-b' }),
      },
    })
    expect(await r(repo, auth({ tenantId: 'tenant-a' }))).toBe(false)
  })
})

describe('useResolver', () => {
  it('tenant キーで resolveTenantAssignment と同等に動く', async () => {
    const r = useResolver('tenant', { tenantId: TenantId('tenant-a') })
    expect(await r(mockRepos({}), auth({ tenantId: 'tenant-a' }))).toBe(true)
    expect(await r(mockRepos({}), auth({ tenantId: 'tenant-b' }))).toBe(false)
  })

  it('shopInTenant キーで resolveShopInTenantContext と同等に動く', async () => {
    const r = useResolver('shopInTenant', {
      tenantId: TenantId('tenant-a'),
      shopId: ShopId('shop-1'),
    })
    const repo = mockRepos({
      shop: {
        findById: async () => ({ tenantId: 'tenant-a' }),
      },
    })
    expect(await r(repo, auth({ tenantId: 'tenant-a' }))).toBe(true)
  })
})
