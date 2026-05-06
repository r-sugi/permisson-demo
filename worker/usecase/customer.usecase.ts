import { HTTPException } from 'hono/http-exception'
import { ulid } from 'ulidx'
import type { AuthContext } from '@shared/permission/types'
import type { CustomerRepository } from '../repository/customer.repository'
import type { PurchaseHistoryRepository } from '../repository/purchase-history.repository'
import type { ShopRepository } from '../repository/shop.repository'
import type { DrizzleDb } from '../services/database.service'

export class CustomerUseCase {
  constructor(
    private readonly customerRepo: CustomerRepository,
    private readonly purchaseHistoryRepo: PurchaseHistoryRepository,
    private readonly db: DrizzleDb,
    private readonly shopRepo: ShopRepository,
    private readonly auth: AuthContext,
  ) {}

  async listCustomers(cursor: string | null | undefined, limit: number) {
    return this.customerRepo.findPage(cursor ?? null, limit)
  }

  async getCustomer(customerId: string) {
    return this.customerRepo.findById(customerId)
  }

  async updateCustomer(
    customerId: string,
    data: { name?: string; tag?: string | null; memo?: string | null },
  ) {
    return this.customerRepo.update(customerId, data)
  }

  async deleteCustomer(customerId: string) {
    return this.customerRepo.delete(customerId)
  }

  async createCustomer(data: {
    name: string
    email: string
    shopId: string
    tag?: string
    memo?: string
  }) {
    const shop = await this.shopRepo.findById(data.shopId)
    if (!shop || shop.tenantId !== this.auth.tenantId) {
      throw new HTTPException(404, { message: 'Not Found' })
    }

    const customerId = ulid()

    // vitestでtransactionをテストできないため、一旦transactionを使わない実装をしている
    await this.customerRepo.insert(this.db, {
      id: customerId,
      name: data.name,
      email: data.email,
      tag: data.tag,
      memo: data.memo,
    })
    await this.purchaseHistoryRepo.insert(this.db, {
      id: ulid(),
      customerId,
      shopId: data.shopId,
    })

    const customer = await this.customerRepo.findRowById(customerId)
    if (!customer) {
      throw new HTTPException(500, { message: 'Customer creation failed' })
    }
    return customer
  }

  async exportCsv() {
    return this.customerRepo.exportAll()
  }
}
