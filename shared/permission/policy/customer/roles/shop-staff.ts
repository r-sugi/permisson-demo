import { CustomerPolicyBase } from '../base'
import type { CustomerPermissions, CustomerPlanFeatures } from '../types'

export class ShopStaffCustomerPolicy extends CustomerPolicyBase {
  listPermissions(): CustomerPermissions & CustomerPlanFeatures {
    return { ...this.rolePermissions(), ...this.planFeatures() }
  }

  private rolePermissions(): CustomerPermissions {
    return { create: false, read: false, update: false, delete: false }
  }

  private planFeatures(): CustomerPlanFeatures {
    return { exportCsv: false }
  }
}
