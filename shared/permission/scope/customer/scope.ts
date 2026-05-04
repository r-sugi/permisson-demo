import { MyAppError } from '@shared/error'

export interface CustomerScope {
  findAllCustomerRows(): Promise<unknown[]>
  isCustomerInScope(customerId: string): Promise<boolean>
  validateCustomerIds(customerIds: string[]): Promise<string[]>
}

export abstract class BaseCustomerScope implements CustomerScope {
  abstract findAllCustomerRows(): Promise<unknown[]>
  abstract isCustomerInScope(customerId: string): Promise<boolean>
  abstract filterAccessibleIds(customerIds: string[]): Promise<string[]>

  async validateCustomerIds(customerIds: string[]): Promise<string[]> {
    const unique = [...new Set(customerIds)]
    const accessible = await this.filterAccessibleIds(unique)
    if (accessible.length !== unique.length) {
      throw new MyAppError(403, 'アクセス権のないカスタマーIDが含まれています')
    }
    return customerIds
  }
}
