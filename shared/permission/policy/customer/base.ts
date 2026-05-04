import { PolicyBase } from '../base'
import type { CustomerPermissions, CustomerPlanFeatures } from './types'

export abstract class CustomerPolicyBase extends PolicyBase {
  abstract listPermissions(): CustomerPermissions & CustomerPlanFeatures
}
