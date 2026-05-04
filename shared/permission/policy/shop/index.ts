import { PolicyBase } from '@shared/permission/policy/base'
import type { ShopPermissions } from './types'

// 全ロールで read=true（スコープの絞り込みは Repository 層で行う）
class AllReadShopPolicy extends PolicyBase {
  listPermissions(): ShopPermissions {
    return { read: true }
  }
}

export { AllReadShopPolicy }
