import type { AuthContext } from '@shared/permission/types'
import type { Repositories } from '@shared/permission/scope/resolver-types'
import type { DrizzleDb } from './services/database.service'
import type { CustomerUseCase } from './usecase/customer.usecase'
import type { ShopUseCase } from './usecase/shop.usecase'

export type UseCases = {
  customer: CustomerUseCase
  shop: ShopUseCase
}

export type Variables = {
  auth: AuthContext
  db: DrizzleDb
  repo: Repositories
  useCase: UseCases
}

export type HonoEnv = {
  Bindings: Env
  Variables: Variables
}
