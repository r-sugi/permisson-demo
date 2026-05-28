import type { AuthContext } from '@shared/permission/types'
import type { ShopRow } from '../rdb/models/shops'
import type { ShopRepository } from './shop.repository'

export class ShopAccessRepository {
  private constructor(
    private readonly shopIds: string[],
    private readonly shopRepo: ShopRepository,
  ) {}

  static create(auth: Pick<AuthContext, 'shopIds'>, shopRepo: ShopRepository): ShopAccessRepository {
    return new ShopAccessRepository(auth.shopIds, shopRepo)
  }

  listAccessible(): Promise<ShopRow[]> {
    return this.shopRepo.listActiveByShopIds(this.shopIds)
  }
}
