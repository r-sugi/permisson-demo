import { HTTPException } from 'hono/http-exception'
import type { AuthContext } from 'shared/permission/types'
import { POLICY_MAP } from 'shared/permission/policy/context'
import { EXPORT_LIMIT_UNLIMITED } from 'shared/permission/types'
import type { CustomerRepository } from '../repository/customer.repository'

export class CustomerUseCase {
  constructor(
    private readonly customerRepo: CustomerRepository,
    private readonly auth: AuthContext,
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

  async exportCsv() {
    const { exportCsvLimit } = POLICY_MAP.customer[this.auth.role]({
      role: this.auth.role,
      plan: this.auth.plan,
      shop_ids: [],
    }).listPermissions()

    // サンプルとして月次カウントは常に0（実際は月次エクスポート数を集計）
    const currentMonthCount = 0
    if (currentMonthCount >= exportCsvLimit) {
      throw new HTTPException(422, {
        message: `エクスポート上限（月${exportCsvLimit === EXPORT_LIMIT_UNLIMITED ? '無制限' : `${exportCsvLimit}件`}）に達しています`,
      })
    }

    return this.customerRepo.exportAll()
  }
}
