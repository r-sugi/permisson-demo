// ================================
// Role・Plan
// ================================
export type Role =
  | 'developer'
  | 'tenant_owner'
  | 'tenant_staff'
  | 'shop_owner'
  | 'shop_staff'
  | 'system'
export type Plan = 'starter' | 'basic' | 'pro'

export const PLAN = {
  STARTER: 'starter',
  BASIC: 'basic',
  PRO: 'pro',
} as const satisfies Record<string, Plan>

// ================================
// コンテキスト型
// ================================
export type AuthContext = {
  userId: string
  tenantId: string
  role: Role
  plan: Plan
  /** 認証時に確定した閲覧可能な店舗ID（リクエスト単位） */
  shopIds: string[]
}

export type PolicyContext = {
  role: Role
  plan: Plan
}

// ================================
// BrandType：IDの種別を型レベルで区別する
// ================================
export type TenantId = string & { readonly _brand: 'TenantId' }
export type ShopId = string & { readonly _brand: 'ShopId' }
export type CustomerId = string & { readonly _brand: 'CustomerId' }

export const TenantId = (id: string): TenantId => id as TenantId
export const ShopId = (id: string): ShopId => id as ShopId
export const CustomerId = (id: string): CustomerId => id as CustomerId

// ================================
// 数量制限：無制限を表す定数（店舗作成上限など）
// ================================
export const SHOP_LIMIT_UNLIMITED = Number.MAX_SAFE_INTEGER
