import { describe, expect, it } from 'vitest'
import { PurchaseHistoryRepository } from './purchase-history.repository'

function makeDbReturningAll(rows: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          all: async () => rows,
        }),
      }),
    }),
  }
}

describe('PurchaseHistoryRepository.evaluateCustomerShopAccess', () => {
  it('rows が空なら null', async () => {
    const db = makeDbReturningAll([])
    const repo = new PurchaseHistoryRepository(db as never)

    await expect(repo.evaluateCustomerShopAccess('cust', 'tenant', ['shop'])).resolves.toBeNull()
  })

  it('tenantMatch=1, shopMatch=0 なら allowedByTenant のみ true', async () => {
    const db = makeDbReturningAll([{ tenantMatch: 1, shopMatch: 0 }])
    const repo = new PurchaseHistoryRepository(db as never)

    await expect(repo.evaluateCustomerShopAccess('cust', 'tenant', ['shop'])).resolves.toEqual({
      allowedByTenant: true,
      allowedByShopAssignment: false,
    })
  })

  it('tenantMatch=0, shopMatch=1 なら allowedByShopAssignment のみ true', async () => {
    const db = makeDbReturningAll([{ tenantMatch: 0, shopMatch: 1 }])
    const repo = new PurchaseHistoryRepository(db as never)

    await expect(repo.evaluateCustomerShopAccess('cust', 'tenant', ['shop'])).resolves.toEqual({
      allowedByTenant: false,
      allowedByShopAssignment: true,
    })
  })

  it('tenantMatch/shopMatch が nullish の場合は false 扱い', async () => {
    const db = makeDbReturningAll([{ tenantMatch: null, shopMatch: undefined }])
    const repo = new PurchaseHistoryRepository(db as never)

    await expect(repo.evaluateCustomerShopAccess('cust', 'tenant', ['shop'])).resolves.toEqual({
      allowedByTenant: false,
      allowedByShopAssignment: false,
    })
  })
})

