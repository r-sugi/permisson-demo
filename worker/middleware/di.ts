import type { Context, Next } from 'hono'
import type { HonoEnv } from '../type'
import { CustomerRepository } from '../repository/customer.repository'
import { CustomerUseCase } from '../usecase/customer.usecase'
import { ShopUseCase } from '../usecase/shop.usecase'

export async function diMiddleware(c: Context<HonoEnv>, next: Next) {
  const auth = c.get('auth')
  const db = c.get('db')

  const customerRepo = CustomerRepository.create(auth.userId, db)

  c.set('usecases', {
    customers: new CustomerUseCase(customerRepo, auth),
    shops: new ShopUseCase(db, auth),
  })

  await next()
}
