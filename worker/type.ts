import type { AuthContext } from 'shared/permission/types'
import type { DrizzleDb } from './services/database.service'
import type { CustomerUseCase } from './usecase/customer.usecase'
import type { ShopUseCase } from './usecase/shop.usecase'

export type Usecases = {
  customers: CustomerUseCase
  shops: ShopUseCase
}

export type Variables = {
  auth: AuthContext
  db: DrizzleDb
  usecases: Usecases
}

export type HonoEnv = {
  Bindings: Env
  Variables: Variables
}
