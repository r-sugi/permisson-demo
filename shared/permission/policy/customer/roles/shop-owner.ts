import { PLAN } from '../../../types'
import { CustomerPolicyBase } from '../base'
import type { CustomerPermissions, CustomerPlanFeatures } from '../types'

export class ShopOwnerCustomerPolicy extends CustomerPolicyBase {
  listPermissions(): CustomerPermissions & CustomerPlanFeatures {
    return { ...this.rolePermissions(), ...this.planFeatures() }
  }

  private rolePermissions(): CustomerPermissions {
    return { create: false, read: true, update: true, delete: false }
  }

  private planFeatures(): CustomerPlanFeatures {
    return {
      exportCsv: this.context.plan !== PLAN.STARTER,
    }
  }
}
