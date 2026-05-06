import type { ShopRow } from '../rdb/models/shops'
import type { ShopRepository } from './shop.repository'
import type { UserRelationRepository } from './user-relation.repository'
import { AssignedShopsScope, TenantShopScope, type ShopScope } from './shop-access-scope'

/**
 * ログインユーザの assignment に応じた店舗の閲覧スコープ。
 * CustomerRepository と同様、リクエスト単位で userId を閉じたファクトリ。
 */
export class ShopAccessRepository {
  private scopeCache?: ShopScope

  private constructor(
    private readonly userId: string,
    private readonly shopRepo: ShopRepository,
    private readonly userRelations: UserRelationRepository,
  ) {}

  static create(
    userId: string,
    shopRepo: ShopRepository,
    userRelations: UserRelationRepository,
  ): ShopAccessRepository {
    return new ShopAccessRepository(userId, shopRepo, userRelations)
  }

  private async resolveScope(): Promise<ShopScope> {
    if (!this.scopeCache) {
      const resolution = await this.userRelations.resolveForUser(this.userId)
      this.scopeCache =
        resolution.kind === 'tenant'
          ? new TenantShopScope(resolution.tenantId, this.shopRepo)
          : new AssignedShopsScope(resolution.userId, this.shopRepo)
    }
    return this.scopeCache
  }

  async listAccessible(): Promise<ShopRow[]> {
    const scope = await this.resolveScope()
    return scope.listAccessible()
  }
}
