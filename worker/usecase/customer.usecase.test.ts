import type { AuthContext } from '@shared/permission/types'
import { describe, expect, it, vi } from 'vitest'
import { CustomerUseCase } from './customer.usecase'

function auth(partial: Pick<AuthContext, 'tenantId' | 'role' | 'plan'> & Partial<AuthContext>): AuthContext {
  return {
    userId: partial.userId ?? 'u',
    tenantId: partial.tenantId,
    role: partial.role,
    plan: partial.plan,
  }
}

describe('CustomerUseCase', () => {
  const db = {} as never

  it('getCustomer は repository に委譲する', async () => {
    const repo = { findById: vi.fn(async () => ({ id: 'c' })) }
    const usecase = new CustomerUseCase(
      repo as never,
      {} as never,
      db,
      {} as never,
      auth({ tenantId: 't', role: 'tenant_owner', plan: 'pro' }),
    )

    const out = await usecase.getCustomer('c')
    expect(repo.findById).toHaveBeenCalledWith('c')
    expect(out).toEqual({ id: 'c' })
  })

  describe('createCustomer', () => {
    const basePayload = {
      name: '名前',
      email: 'e@example.com',
      shopId: 'shop-1',
    }

    it('shop が見つからない場合は404（insert しない）', async () => {
      const customerRepo = {
        insert: vi.fn(),
        findRowById: vi.fn(),
      }
      const purchaseHistoryRepo = { insert: vi.fn() }
      const shopRepo = { findById: vi.fn(async () => null) }

      const usecase = new CustomerUseCase(
        customerRepo as never,
        purchaseHistoryRepo as never,
        db,
        shopRepo as never,
        auth({ tenantId: 't', role: 'tenant_owner', plan: 'pro' }),
      )

      await expect(usecase.createCustomer(basePayload)).rejects.toMatchObject({ status: 404 })
      expect(shopRepo.findById).toHaveBeenCalledWith('shop-1')
      expect(customerRepo.insert).not.toHaveBeenCalled()
      expect(purchaseHistoryRepo.insert).not.toHaveBeenCalled()
    })

    it('別テナントの shopId なら404（insert しない）', async () => {
      const customerRepo = {
        insert: vi.fn(),
        findRowById: vi.fn(),
      }
      const purchaseHistoryRepo = { insert: vi.fn() }
      const shopRepo = {
        findById: vi.fn(async () => ({ tenantId: 'other-tenant' })),
      }

      const usecase = new CustomerUseCase(
        customerRepo as never,
        purchaseHistoryRepo as never,
        db,
        shopRepo as never,
        auth({ tenantId: 't', role: 'tenant_owner', plan: 'pro' }),
      )

      await expect(usecase.createCustomer(basePayload)).rejects.toMatchObject({ status: 404 })
      expect(customerRepo.insert).not.toHaveBeenCalled()
      expect(purchaseHistoryRepo.insert).not.toHaveBeenCalled()
    })

    it('自テナントの shop なら顧客と購入履歴を保存して行を返す', async () => {
      let insertedCustomerId = ''
      let insertedHistoryId = ''
      const customerRepo = {
        insert: vi.fn(
          async (
            _db: unknown,
            row: { id: string; name: string; email: string; tag?: string; memo?: string | null },
          ) => {
            insertedCustomerId = row.id
          },
        ),
        findRowById: vi.fn(async () => ({
          id: 'cust-row',
          name: '名前',
          email: 'e@example.com',
        })),
      }
      const purchaseHistoryRepo = {
        insert: vi.fn(
          async (
            _db: unknown,
            row: { id: string; customerId: string; shopId: string; tenantId: string },
          ) => {
            insertedHistoryId = row.id
          },
        ),
      }
      const shopRepo = {
        findById: vi.fn(async () => ({ tenantId: 't' })),
      }

      const usecase = new CustomerUseCase(
        customerRepo as never,
        purchaseHistoryRepo as never,
        db,
        shopRepo as never,
        auth({ tenantId: 't', role: 'tenant_owner', plan: 'pro' }),
      )

      const out = await usecase.createCustomer(basePayload)

      expect(customerRepo.insert).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          name: '名前',
          email: 'e@example.com',
        }),
      )
      expect(insertedCustomerId).toMatch(/^[0-9A-Z]{26}$/)

      expect(purchaseHistoryRepo.insert).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          customerId: insertedCustomerId,
          shopId: 'shop-1',
          tenantId: 't',
        }),
      )
      expect(insertedHistoryId).toMatch(/^[0-9A-Z]{26}$/)

      expect(customerRepo.findRowById).toHaveBeenCalledWith(insertedCustomerId)
      expect(out).toEqual({
        id: 'cust-row',
        name: '名前',
        email: 'e@example.com',
      })
    })
  })
})
