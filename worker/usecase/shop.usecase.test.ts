import { describe, expect, it, vi } from 'vitest'
import { ShopUseCase } from './shop.usecase'

describe('ShopUseCase', () => {
  it('getShopCountByTenant は repository に委譲する', async () => {
    const shopRepo = { countActiveByTenantId: vi.fn(async () => 3) }
    const usecase = new ShopUseCase(
      shopRepo as never,
      {} as never,
      {} as never,
      { userId: 'u', tenantId: 't', role: 'tenant_owner', plan: 'pro' } as never,
    )

    const out = await usecase.getShopCountByTenant('t')
    expect(shopRepo.countActiveByTenantId).toHaveBeenCalledWith('t')
    expect(out).toBe(3)
  })
})
