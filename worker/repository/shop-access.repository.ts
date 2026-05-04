import type { ShopRow } from '../rdb/models/shops'
import { ShopRepository } from './shop.repository'
import { UserRelationRepository } from './user-relation.repository'

/**
 * ログインユーザの assignment に応じた店舗の閲覧スコープ。
 * CustomerRepository と同様、リクエスト単位で userId を閉じたファクトリ。
 */
export class ShopAccessRepository {
  private constructor(
    private readonly userId: string,
    private readonly shops: ShopRepository,
    private readonly userRelations: UserRelationRepository,
  ) {}

  static create(
    userId: string,
    shopRepo: ShopRepository,
    userRelations: UserRelationRepository,
  ): ShopAccessRepository {
    return new ShopAccessRepository(userId, shopRepo, userRelations)
  }

  async listAccessible(): Promise<ShopRow[]> {
    const { relation, resourceId } = await this.userRelations.resolveForUser(this.userId)

    if (relation === 'tenant_owner' || relation === 'tenant_staff' || relation === 'developer') {
      return this.shops.listActiveByTenantId(resourceId)
    }

    if (relation === 'shop_assigned') {
      return this.shops.listActiveByShopId(resourceId)
    }

    return []
  }
}
