import type { AuthContext, Role } from '@shared/permission/types'
import type { Repositories } from '@shared/permission/scope/resolver-types'
import type { DrizzleDb } from './services/database.service'
import type { CustomerUseCase } from './usecase/customer.usecase'
import type { ShopUseCase } from './usecase/shop.usecase'

type Jwt = {
  sub: string
  role: Role
  tenantId: string
  iat?: number
  exp?: number
}

export type UseCases = {
  customer: CustomerUseCase
  shop: ShopUseCase
}

export type Variables = {
  jwt: Jwt
  auth: AuthContext
  db: DrizzleDb
  repo: Repositories
  useCase: UseCases
}

export type HonoEnv = {
  Bindings: Env
  Variables: Variables
}
