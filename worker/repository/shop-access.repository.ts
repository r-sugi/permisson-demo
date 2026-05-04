import type { ShopRow } from '../rdb/models/shops'
import { ShopRepository } from './shop.repository'
import { UserRelationRepository } from './user-relation.repository'
import { createShopAccessScopeMap, type ShopScope } from './shop-access-scope'

// ─────────────────────────────────────────────
// ShopAccessRepository
// ─────────────────────────────────────────────

/**
 * ログインユーザの assignment に応じた店舗の閲覧スコープ。
 * CustomerRepository と同様、リクエスト単位で userId を閉じたファクトリ。
 */
export class ShopAccessRepository {
  private scopeCache?: ShopScope
  private readonly shopScopeMap: ReturnType<typeof createShopAccessScopeMap>

  private constructor(
    private readonly userId: string,
    shopRepo: ShopRepository,
    private readonly userRelations: UserRelationRepository,
  ) {
    this.shopScopeMap = createShopAccessScopeMap(shopRepo)
  }

  static create(
    userId: string,
    shopRepo: ShopRepository,
    userRelations: UserRelationRepository,
  ): ShopAccessRepository {
    return new ShopAccessRepository(userId, shopRepo, userRelations)
  }

  private async resolveScope(): Promise<ShopScope> {
    if (!this.scopeCache) {
      const { relation, resourceId } = await this.userRelations.resolveForUser(this.userId)
      this.scopeCache = this.shopScopeMap[relation](resourceId)
    }
    return this.scopeCache
  }

  async listAccessible(): Promise<ShopRow[]> {
    const scope = await this.resolveScope()
    return scope.listAccessible()
  }
}
