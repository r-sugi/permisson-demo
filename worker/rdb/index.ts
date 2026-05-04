export * from './models/admin-users'
export * from './models/tenants'
export * from './models/subscriptions'
export * from './models/shops'
export * from './models/customers'
export * from './models/purchase-histories'
export * from './models/shop-assignments'

import { adminUsers } from './models/admin-users'
import { tenants } from './models/tenants'
import { subscriptions } from './models/subscriptions'
import { shops } from './models/shops'
import { customers } from './models/customers'
import { purchaseHistories } from './models/purchase-histories'
import { shopAssignments } from './models/shop-assignments'

export const schema = {
  adminUsers,
  tenants,
  subscriptions,
  shops,
  customers,
  purchaseHistories,
  shopAssignments,
}
