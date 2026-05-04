import type { Relation } from '../types'
import type { CustomerScope } from './scope'

// Worker 層から注入する実装クラスのファクトリ型
export type CustomerScopeFactory = (resourceId: string) => CustomerScope

export type ScopeMap = {
  [K in Relation]: CustomerScopeFactory
}
