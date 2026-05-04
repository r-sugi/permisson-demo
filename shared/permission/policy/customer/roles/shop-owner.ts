import { PLAN, EXPORT_LIMIT_UNLIMITED } from '../../../types'
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
