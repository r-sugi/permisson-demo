import type { RelationResolver } from './resolver-types'
import type { TenantId, ShopId } from '../types'
import {
  resolveTenantAssignment,
  resolveShopAssignment,
  resolveShopViaTenant,
  resolveCustomerViaShop,
} from './resolvers'

type ResolverArgMap = {
  tenant: { tenantId: TenantId }
  shop: { shopId: ShopId }
  shopViaTenant: { shopId: ShopId }
  customerViaShop: { customerId: string }
}

const RESOLVER_MAP: {
  [K in keyof ResolverArgMap]: (args: ResolverArgMap[K]) => RelationResolver
} = {
  tenant: ({ tenantId }) => resolveTenantAssignment(tenantId),
  shop: ({ shopId }) => resolveShopAssignment(shopId),
  shopViaTenant: ({ shopId }) => resolveShopViaTenant(shopId),
  customerViaShop: ({ customerId }) => resolveCustomerViaShop(customerId),
}

function callResolver<T extends keyof ResolverArgMap>(
  map: { [K in keyof ResolverArgMap]: (args: ResolverArgMap[K]) => RelationResolver },
  key: T,
  args: ResolverArgMap[T],
): RelationResolver {
  return map[key](args)
}

export function useResolver<T extends keyof ResolverArgMap>(
  key: T,
  args: ResolverArgMap[T],
): RelationResolver {
  return callResolver(RESOLVER_MAP, key, args)
}
