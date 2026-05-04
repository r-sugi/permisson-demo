import type { PolicyContext } from '@shared/permission/types'

export abstract class PolicyBase {
  constructor(protected context: PolicyContext) {}
}
