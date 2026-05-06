import { PLAN } from '@shared/permission/types'
import { CustomerPolicyBase } from '@shared/permission/policy/customer/base'
import type {
  CustomerPermissions,
  CustomerPlanFeatures,
} from '@shared/permission/policy/customer/types'

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
