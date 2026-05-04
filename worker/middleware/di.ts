import type { Context, Next } from 'hono'
import type { HonoEnv } from '../type'
import { CustomerRepository } from '../repository/customer.repository'
import { ShopAssignmentRepository } from '../repository/shop-assignment.repository'
import { ShopRepository } from '../repository/shop.repository'
import { PurchaseHistoryRepository } from '../repository/purchase-history.repository'
import { CustomerUseCase } from '../usecase/customer.usecase'
import { ShopUseCase } from '../usecase/shop.usecase'

export async function diMiddleware(c: Context<HonoEnv>, next: Next) {
  const auth = c.get('auth')
  const db = c.get('db')

  c.set('repos', {
    shopAssignment: new ShopAssignmentRepository(db),
    shop: new ShopRepository(db),
    purchaseHistory: new PurchaseHistoryRepository(db),
  })

  const customerRepo = CustomerRepository.create(auth.userId, db)

  c.set('usecases', {
    customers: new CustomerUseCase(customerRepo, auth),
    shops: new ShopUseCase(db, auth),
  })

  await next()
}
