import { SettingsPolicyBase } from '../base'
import type { SettingsPermissions, SettingsPlanFeatures } from '../types'

// shop_owner / shop_staff は shop 管理操作を一切できない
export class ShopOwnerSettingsPolicy extends SettingsPolicyBase {
  listPermissions(): SettingsPermissions & SettingsPlanFeatures {
    return { ...this.rolePermissions(), ...this.planFeatures() }
  }

  private rolePermissions(): SettingsPermissions {
    return { createShop: false, updateShop: false, deleteShop: false }
  }

  private planFeatures(): SettingsPlanFeatures {
    return { createShopLimit: 0 }
  }
}
