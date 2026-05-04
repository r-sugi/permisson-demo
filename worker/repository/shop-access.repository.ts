import type { Relation } from 'shared/permission/scope/types'
import type { ShopRow } from '../rdb/models/shops'
import { ShopRepository } from './shop.repository'
import { UserRelationRepository } from './user-relation.repository'

// ─────────────────────────────────────────────
// Scope 実装（店舗一覧の解決。CustomerRepository のスコープと同型の責務分離）
// ─────────────────────────────────────────────

interface ShopScope {
  listAccessible(): Promise<ShopRow[]>
}

class TenantShopScope implements ShopScope {
  constructor(
    private readonly tenantId: string,
    private readonly shops: ShopRepository,
  ) {}

  listAccessible(): Promise<ShopRow[]> {
    return this.shops.listActiveByTenantId(this.tenantId)
  }
}

class AssignedShopScope implements ShopScope {
  constructor(
    private readonly shopId: string,
    private readonly shops: ShopRepository,
  ) {}

  listAccessible(): Promise<ShopRow[]> {
    return this.shops.listActiveByShopId(this.shopId)
  }
}

const scopeMap: Record<Relation, (resourceId: string, shops: ShopRepository) => ShopScope> = {
  tenant_owner: (resourceId, shops) => new TenantShopScope(resourceId, shops),
  tenant_staff: (resourceId, shops) => new TenantShopScope(resourceId, shops),
  developer: (resourceId, shops) => new TenantShopScope(resourceId, shops),
  shop_assigned: (resourceId, shops) => new AssignedShopScope(resourceId, shops),
}

// ─────────────────────────────────────────────
// ShopAccessRepository
// ─────────────────────────────────────────────

/**
 * ログインユーザの assignment に応じた店舗の閲覧スコープ。
 * CustomerRepository と同様、リクエスト単位で userId を閉じたファクトリ。
 */
export class ShopAccessRepository {
  private scopeCache?: ShopScope

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

  private async resolveScope(): Promise<ShopScope> {
    if (!this.scopeCache) {
      const { relation, resourceId } = await this.userRelations.resolveForUser(this.userId)
      this.scopeCache = scopeMap[relation](resourceId, this.shops)
    }
    return this.scopeCache
  }

  async listAccessible(): Promise<ShopRow[]> {
    const scope = await this.resolveScope()
    return scope.listAccessible()
  }
}
