import type { PolicyContext } from '../types'

export abstract class PolicyBase {
  constructor(protected context: PolicyContext) {}
}
