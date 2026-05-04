import type { ResourceMap, Relation, RelationResolver } from './types'

// 純粋関数：DBアクセスなし。resourceはWorker層でDBから取得して渡す
export const registry: {
  [K in keyof ResourceMap]: RelationResolver<ResourceMap[K]>
} = {
  tenant_assignment: (_userId, resource) => {
    return resource.role as Relation
  },
  shop_assignment: (userId, resource) => {
    if (resource.adminUserId === userId) return 'shop_assigned'
    return null
  },
}
