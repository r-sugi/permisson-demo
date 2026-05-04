import { HTTPException } from 'hono/http-exception'

export interface CustomerScope {
  resolveIds(): Promise<string[]>
  validateIds(customerIds: string[]): Promise<string[]>
}

export abstract class BaseCustomerScope implements CustomerScope {
  abstract resolveIds(): Promise<string[]>

  async validateIds(customerIds: string[]): Promise<string[]> {
    const accessibleIds = await this.resolveIds()
    const accessibleSet = new Set(accessibleIds)
    const invalidIds = customerIds.filter((id) => !accessibleSet.has(id))
    if (invalidIds.length > 0) {
      throw new HTTPException(403, {
        message: 'アクセス権のないカスタマーIDが含まれています',
      })
    }
    return customerIds
  }
}
