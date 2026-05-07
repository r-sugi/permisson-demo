import type { AuthContext } from '@shared/permission/types'
import { describe, expect, it, vi } from 'vitest'
import { ShopUseCase } from './shop.usecase'

function auth(partial: Pick<AuthContext, 'tenantId' | 'role' | 'plan'> & Partial<AuthContext>): AuthContext {
  return {
    userId: partial.userId ?? 'u',
    tenantId: partial.tenantId,
    role: partial.role,
    plan: partial.plan,
  }
}

describe('ShopUseCase', () => {
  it('getShopCountByTenant は repository に委譲する', async () => {
    const shopRepo = { countActiveByTenantId: vi.fn(async () => 3) }
    const usecase = new ShopUseCase(
      shopRepo as never,
      {} as never,
      {} as never,
      auth({ tenantId: 't', role: 'tenant_owner', plan: 'pro' }),
    )

    const out = await usecase.getShopCountByTenant('t')
    expect(shopRepo.countActiveByTenantId).toHaveBeenCalledWith('t')
    expect(out).toBe(3)
  })

  describe('createShop', () => {
    const emptyDeps = {} as never

    it('starter: 上限5件に達したら422（insertShop は呼ばない）', async () => {
      const insertShop = vi.fn()
      const shopRepo = {
        countActiveByTenantId: vi.fn(async () => 5),
        insertShop,
      }
      const usecase = new ShopUseCase(
        shopRepo as never,
        emptyDeps,
        emptyDeps,
        auth({ tenantId: 't', role: 'tenant_owner', plan: 'starter' }),
      )

      await expect(usecase.createShop('t', '新店舗')).rejects.toMatchObject({ status: 422 })
      expect(insertShop).not.toHaveBeenCalled()
      expect(shopRepo.countActiveByTenantId).toHaveBeenCalledWith('t')
    })

    it('starter: 4件なら作成できる', async () => {
      const insertShop = vi.fn(async () => ({ id: 'new-shop', tenantId: 't', name: '新店舗' }))
      const shopRepo = {
        countActiveByTenantId: vi.fn(async () => 4),
        insertShop,
      }
      const usecase = new ShopUseCase(
        shopRepo as never,
        emptyDeps,
        emptyDeps,
        auth({ tenantId: 't', role: 'tenant_owner', plan: 'starter' }),
      )

      const out = await usecase.createShop('t', '新店舗')
      expect(insertShop).toHaveBeenCalledTimes(1)
      expect(insertShop.mock.calls[0][0]).toMatchObject({
        tenantId: 't',
        name: '新店舗',
      })
      expect(insertShop.mock.calls[0][0].id).toMatch(/^[0-9A-Z]{26}$/)
      expect(out).toEqual({ id: 'new-shop', tenantId: 't', name: '新店舗' })
    })

    it('basic: 上限30件に達したら422', async () => {
      const shopRepo = {
        countActiveByTenantId: vi.fn(async () => 30),
        insertShop: vi.fn(),
      }
      const usecase = new ShopUseCase(
        shopRepo as never,
        emptyDeps,
        emptyDeps,
        auth({ tenantId: 't', role: 'tenant_owner', plan: 'basic' }),
      )

      await expect(usecase.createShop('t', 'x')).rejects.toMatchObject({ status: 422 })
      expect(shopRepo.insertShop).not.toHaveBeenCalled()
    })

    it('basic: 29件なら作成できる', async () => {
      const shopRepo = {
        countActiveByTenantId: vi.fn(async () => 29),
        insertShop: vi.fn(async () => ({ id: 's', tenantId: 't', name: 'x' })),
      }
      const usecase = new ShopUseCase(
        shopRepo as never,
        emptyDeps,
        emptyDeps,
        auth({ tenantId: 't', role: 'tenant_owner', plan: 'basic' }),
      )

      await usecase.createShop('t', 'x')
      expect(shopRepo.insertShop).toHaveBeenCalled()
    })

    it('pro: 件数が大きくても無制限なので作成できる', async () => {
      const shopRepo = {
        countActiveByTenantId: vi.fn(async () => 100_000),
        insertShop: vi.fn(async () => ({ id: 's', tenantId: 't', name: '新店' })),
      }
      const usecase = new ShopUseCase(
        shopRepo as never,
        emptyDeps,
        emptyDeps,
        auth({ tenantId: 't', role: 'tenant_owner', plan: 'pro' }),
      )

      await usecase.createShop('t', '新店')
      expect(shopRepo.insertShop).toHaveBeenCalledTimes(1)
    })
  })

  describe('deleteShop', () => {
    const emptyDeps = {} as never

    it('店舗が存在しない、または別テナントなら404', async () => {
      const shopRepo = {
        findById: vi.fn(async () => null),
        deleteById: vi.fn(),
      }
      const usecase = new ShopUseCase(
        shopRepo as never,
        emptyDeps,
        emptyDeps,
        auth({ tenantId: 't', role: 'tenant_owner', plan: 'pro' }),
      )

      await expect(usecase.deleteShop('shop-x')).rejects.toMatchObject({ status: 404 })
      expect(shopRepo.deleteById).not.toHaveBeenCalled()
    })

    it('店舗の tenantId が JWT と一致しなければ404', async () => {
      const shopRepo = {
        findById: vi.fn(async () => ({ tenantId: 'other-tenant' })),
        deleteById: vi.fn(),
      }
      const usecase = new ShopUseCase(
        shopRepo as never,
        emptyDeps,
        emptyDeps,
        auth({ tenantId: 't', role: 'tenant_owner', plan: 'pro' }),
      )

      await expect(usecase.deleteShop('shop-1')).rejects.toMatchObject({ status: 404 })
      expect(shopRepo.deleteById).not.toHaveBeenCalled()
    })

    it('自テナントの店舗なら削除して shopId を返す', async () => {
      const shopRepo = {
        findById: vi.fn(async () => ({ tenantId: 't' })),
        deleteById: vi.fn(async () => {}),
      }
      const usecase = new ShopUseCase(
        shopRepo as never,
        emptyDeps,
        emptyDeps,
        auth({ tenantId: 't', role: 'tenant_owner', plan: 'pro' }),
      )

      const out = await usecase.deleteShop('shop-1')
      expect(shopRepo.deleteById).toHaveBeenCalledWith('shop-1')
      expect(out).toEqual({ shopId: 'shop-1' })
    })
  })
})
