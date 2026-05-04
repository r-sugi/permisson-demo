import type { Context, Next } from 'hono'
import type { HonoEnv } from '../type'
import { CustomerRepository } from '../repository/customer.repository'
import { ShopAssignmentRepository } from '../repository/shop-assignment.repository'
import { ShopAccessRepository } from '../repository/shop-access.repository'
import { ShopRepository } from '../repository/shop.repository'
import { UserRelationRepository } from '../repository/user-relation.repository'
import { PurchaseHistoryRepository } from '../repository/purchase-history.repository'
import { CustomerUseCase } from '../usecase/customer.usecase'
import { ShopUseCase } from '../usecase/shop.usecase'

export async function diMiddleware(c: Context<HonoEnv>, next: Next) {
  const auth = c.get('auth')
  const db = c.get('db')

  const shopRepo = new ShopRepository(db)
  const userRelations = new UserRelationRepository(db)

  const purchaseHistoryRepo = new PurchaseHistoryRepository(db)

  c.set('repo', {
    shopAssignment: new ShopAssignmentRepository(db),
    shop: shopRepo,
    purchaseHistory: purchaseHistoryRepo,
  })

  const customerRepo = CustomerRepository.create(auth.userId, db, userRelations)
  const shopAccessRepo = ShopAccessRepository.create(auth.userId, shopRepo, userRelations)

  c.set('useCase', {
    customer: new CustomerUseCase(customerRepo, purchaseHistoryRepo, db, shopRepo, auth),
    shop: new ShopUseCase(shopRepo, shopAccessRepo, auth),
  })

  await next()
}
