import { PLAN, SHOP_LIMIT_UNLIMITED } from '../../../types'
import { SettingsPolicyBase } from '../base'
import type { SettingsPermissions, SettingsPlanFeatures } from '../types'

export class TenantOwnerSettingsPolicy extends SettingsPolicyBase {
  listPermissions(): SettingsPermissions & SettingsPlanFeatures {
    return { ...this.rolePermissions(), ...this.planFeatures() }
  }

  private rolePermissions(): SettingsPermissions {
    return { createShop: true, updateShop: true, deleteShop: true }
  }

  private planFeatures(): SettingsPlanFeatures {
    return { createShopLimit: this.resolveCreateShopLimit() }
  }

  private resolveCreateShopLimit(): number {
    const limits: Record<string, number> = {
      [PLAN.STARTER]: 5,
      [PLAN.BASIC]: 30,
      [PLAN.PRO]: SHOP_LIMIT_UNLIMITED,
    }
    return limits[this.context.plan] ?? 5
  }
}
