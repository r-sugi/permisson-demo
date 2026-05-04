import type { GateRelationResolver } from './resolver-types'
import type { TenantId, ShopId, CustomerId } from '@shared/permission/types'
import {
  resolveTenantAssignment,
  resolveShopAssignment,
  resolveShopViaTenant,
  resolveCustomerViaShop,
  resolveShopInTenantContext,
} from './resolvers'

type ResolverArgMap = {
  tenant: { tenantId: TenantId }
  shop: { shopId: ShopId }
  shopViaTenant: { shopId: ShopId }
  shopInTenant: { tenantId: TenantId; shopId: ShopId }
  customerViaShop: { customerId: CustomerId }
}

const RESOLVER_MAP: {
  [K in keyof ResolverArgMap]: (args: ResolverArgMap[K]) => GateRelationResolver
} = {
  tenant: ({ tenantId }) => resolveTenantAssignment(tenantId),
  shop: ({ shopId }) => resolveShopAssignment(shopId),
  shopViaTenant: ({ shopId }) => resolveShopViaTenant(shopId),
  shopInTenant: ({ tenantId, shopId }) => resolveShopInTenantContext(tenantId, shopId),
  customerViaShop: ({ customerId }) => resolveCustomerViaShop(customerId),
}

function callResolver<T extends keyof ResolverArgMap>(
  map: { [K in keyof ResolverArgMap]: (args: ResolverArgMap[K]) => GateRelationResolver },
  key: T,
  args: ResolverArgMap[T],
): GateRelationResolver {
  return map[key](args)
}

export function useResolver<T extends keyof ResolverArgMap>(
  key: T,
  args: ResolverArgMap[T],
): GateRelationResolver {
  return callResolver(RESOLVER_MAP, key, args)
}
