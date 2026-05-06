import { PLAN } from '@shared/permission/types'
import { CustomerPolicyBase } from '@shared/permission/policy/customer/base'
import type {
  CustomerPermissions,
  CustomerPlanFeatures,
} from '@shared/permission/policy/customer/types'

// tenant_owner / tenant_staff / developer に共通
export class TenantOwnerCustomerPolicy extends CustomerPolicyBase {
  listPermissions(): CustomerPermissions & CustomerPlanFeatures {
    return { ...this.rolePermissions(), ...this.planFeatures() }
  }

  private rolePermissions(): CustomerPermissions {
    return { create: true, read: true, update: true, delete: true }
  }

  private planFeatures(): CustomerPlanFeatures {
    return {
      exportCsv: this.context.plan !== PLAN.STARTER,
    }
  }
}
