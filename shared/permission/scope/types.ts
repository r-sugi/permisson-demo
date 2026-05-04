import type { TenantId, ShopId, Role } from '../types'

/** Relation の tenant_assignment と同期する単一ソース */
export const TENANT_ASSIGNMENT_ROLES = ['tenant_owner', 'tenant_staff', 'developer'] as const
export type TenantAssignmentRole = (typeof TENANT_ASSIGNMENT_ROLES)[number]

export function isTenantAssignmentRole(role: Role): role is TenantAssignmentRole {
  return (TENANT_ASSIGNMENT_ROLES as readonly Role[]).includes(role)
}

export type TenantAssignmentResource = {
  role: Role
}

export type ShopAssignmentResource = {
  adminUserId: string
  shopId: ShopId
}

export type RelationMap = {
  tenant_assignment: TenantAssignmentRole
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
