import type { TenantId, ShopId, Role } from '../types'

export type TenantAssignmentResource = {
  role: Role
}

export type ShopAssignmentResource = {
  adminUserId: string
  shopId: ShopId
}

export type RelationMap = {
  tenant_assignment: 'tenant_owner' | 'tenant_staff' | 'developer'
  shop_assignment: 'shop_assigned'
}

export type ResourceMap = {
  tenant_assignment: TenantAssignmentResource
  shop_assignment: ShopAssignmentResource
}

export type ResourceIdMap = {
  tenant_assignment: TenantId
  shop_assignment: ShopId
}

export type Relation = RelationMap[keyof RelationMap]
export type RelationResolver<T> = (userId: string, resource: T) => Relation | null
