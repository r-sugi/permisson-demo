import { HTTPException } from 'hono/http-exception'
import { ulid } from 'ulidx'
import type { CustomerRepository } from '../repository/customer.repository'
import type { PurchaseHistoryRepository } from '../repository/purchase-history.repository'
import type { DrizzleDb } from '../services/database.service'

export class CustomerUseCase {
  constructor(
    private readonly customerRepo: CustomerRepository,
    private readonly purchaseHistoryRepo: PurchaseHistoryRepository,
    private readonly db: DrizzleDb,
  ) {}

  async listCustomers() {
    return this.customerRepo.findAll()
  }

  async getCustomer(customerId: string) {
    return this.customerRepo.findById(customerId)
  }

  async updateCustomer(customerId: string, data: { name?: string; tag?: string | null; memo?: string | null }) {
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
    const customerId = ulid()
    await this.db.transaction(async (tx) => {
      await this.customerRepo.insert(tx, {
        id: customerId,
        name: data.name,
        email: data.email,
        tag: data.tag,
        memo: data.memo,
      })
      await this.purchaseHistoryRepo.insert(tx, {
        id: ulid(),
        customerId,
        shopId: data.shopId,
      })
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
