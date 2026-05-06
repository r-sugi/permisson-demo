import { describe, expect, it, vi } from 'vitest'
import { CustomerUseCase } from './customer.usecase'

describe('CustomerUseCase', () => {
  it('getCustomer は repository に委譲する', async () => {
    const repo = { findById: vi.fn(async () => ({ id: 'c' })) }
    const usecase = new CustomerUseCase(
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      { userId: 'u', tenantId: 't', role: 'tenant_owner', plan: 'pro' } as never,
    )

    const out = await usecase.getCustomer('c')
    expect(repo.findById).toHaveBeenCalledWith('c')
    expect(out).toEqual({ id: 'c' })
  })
})
