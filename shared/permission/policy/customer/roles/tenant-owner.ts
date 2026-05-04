import { PLAN, EXPORT_LIMIT_UNLIMITED } from '../../../types'
import { CustomerPolicyBase } from '../base'
import type { CustomerPermissions, CustomerPlanFeatures } from '../types'

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
      exportCsvLimit: this.resolveExportCsvLimit(),
    }
  }

  private resolveExportCsvLimit(): number {
    const limits: Record<string, number> = {
      [PLAN.STARTER]: 0,
      [PLAN.BASIC]: 100,
      [PLAN.PRO]: EXPORT_LIMIT_UNLIMITED,
    }
    return limits[this.context.plan] ?? 0
  }
}
