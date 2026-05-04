import { describe, it, expect } from 'vitest'
import { POLICY_MAP } from './context'
import type { PolicyContext } from '@shared/permission/types'

function makeCtx(role: string, plan: string): PolicyContext {
  return { role: role as PolicyContext['role'], plan: plan as PolicyContext['plan'], shop_ids: [] }
}

describe('POLICY_MAP - customer', () => {
  describe('tenant_owner', () => {
    it('pro: 全操作可 + CSV可', () => {
      const perms = POLICY_MAP.customer.tenant_owner(makeCtx('tenant_owner', 'pro')).listPermissions()
      expect(perms.create).toBe(true)
      expect(perms.read).toBe(true)
      expect(perms.update).toBe(true)
      expect(perms.delete).toBe(true)
      expect(perms.exportCsv).toBe(true)
    })

    it('basic: 全操作可 + CSV可', () => {
      const perms = POLICY_MAP.customer.tenant_owner(makeCtx('tenant_owner', 'basic')).listPermissions()
      expect(perms.exportCsv).toBe(true)
    })

    it('starter: 全操作可 + CSV不可', () => {
      const perms = POLICY_MAP.customer.tenant_owner(makeCtx('tenant_owner', 'starter')).listPermissions()
      expect(perms.create).toBe(true)
      expect(perms.exportCsv).toBe(false)
    })
  })

  describe('tenant_staff', () => {
    it('pro: tenant_owner と同権限', () => {
      const perms = POLICY_MAP.customer.tenant_staff(makeCtx('tenant_staff', 'pro')).listPermissions()
      expect(perms.create).toBe(true)
      expect(perms.delete).toBe(true)
      expect(perms.exportCsv).toBe(true)
    })
  })

  describe('shop_owner', () => {
    it('pro: read/update可、create/delete不可', () => {
      const perms = POLICY_MAP.customer.shop_owner(makeCtx('shop_owner', 'pro')).listPermissions()
      expect(perms.create).toBe(false)
      expect(perms.read).toBe(true)
      expect(perms.update).toBe(true)
      expect(perms.delete).toBe(false)
      expect(perms.exportCsv).toBe(true)
    })

    it('basic: CSV可', () => {
      const perms = POLICY_MAP.customer.shop_owner(makeCtx('shop_owner', 'basic')).listPermissions()
      expect(perms.exportCsv).toBe(true)
    })

    it('starter: CSV不可', () => {
      const perms = POLICY_MAP.customer.shop_owner(makeCtx('shop_owner', 'starter')).listPermissions()
      expect(perms.exportCsv).toBe(false)
    })
  })

  describe('shop_staff', () => {
    it('全操作不可', () => {
      const perms = POLICY_MAP.customer.shop_staff(makeCtx('shop_staff', 'pro')).listPermissions()
      expect(perms.create).toBe(false)
      expect(perms.read).toBe(false)
      expect(perms.update).toBe(false)
      expect(perms.delete).toBe(false)
      expect(perms.exportCsv).toBe(false)
    })
  })

  describe('developer', () => {
    it('pro: tenant_owner と同様の顧客権限', () => {
      const dev = POLICY_MAP.customer.developer(makeCtx('developer', 'pro')).listPermissions()
      const owner = POLICY_MAP.customer.tenant_owner(makeCtx('tenant_owner', 'pro')).listPermissions()
      expect(dev).toEqual(owner)
    })
  })

  describe('system', () => {
    it('pro: tenant_owner と同様の顧客権限', () => {
      const sys = POLICY_MAP.customer.system(makeCtx('system', 'pro')).listPermissions()
      const owner = POLICY_MAP.customer.tenant_owner(makeCtx('tenant_owner', 'pro')).listPermissions()
      expect(sys).toEqual(owner)
    })
  })
})

describe('POLICY_MAP - settings', () => {
  describe('tenant_owner', () => {
    it('pro: 全操作可 + 店舗無制限', () => {
      const perms = POLICY_MAP.settings.tenant_owner(makeCtx('tenant_owner', 'pro')).listPermissions()
      expect(perms.createShop).toBe(true)
      expect(perms.deleteShop).toBe(true)
      expect(perms.createShopLimit).toBe(Number.MAX_SAFE_INTEGER)
    })

    it('basic: 30店舗まで', () => {
      const perms = POLICY_MAP.settings.tenant_owner(makeCtx('tenant_owner', 'basic')).listPermissions()
      expect(perms.createShopLimit).toBe(30)
    })

    it('starter: 5店舗まで', () => {
      const perms = POLICY_MAP.settings.tenant_owner(makeCtx('tenant_owner', 'starter')).listPermissions()
      expect(perms.createShopLimit).toBe(5)
    })
  })

  describe('shop_owner', () => {
    it('全設定操作不可', () => {
      const perms = POLICY_MAP.settings.shop_owner(makeCtx('shop_owner', 'pro')).listPermissions()
      expect(perms.createShop).toBe(false)
      expect(perms.deleteShop).toBe(false)
      expect(perms.createShopLimit).toBe(0)
    })
  })

  describe('shop_staff', () => {
    it('全設定操作不可', () => {
      const perms = POLICY_MAP.settings.shop_staff(makeCtx('shop_staff', 'pro')).listPermissions()
      expect(perms.createShop).toBe(false)
    })
  })

  describe('tenant_staff', () => {
    it('pro: tenant_owner と同様に店舗作成・削除可 + 無制限', () => {
      const staff = POLICY_MAP.settings.tenant_staff(makeCtx('tenant_staff', 'pro')).listPermissions()
      const owner = POLICY_MAP.settings.tenant_owner(makeCtx('tenant_owner', 'pro')).listPermissions()
      expect(staff.createShop).toBe(true)
      expect(staff.deleteShop).toBe(true)
      expect(staff.createShopLimit).toBe(owner.createShopLimit)
    })

    it('starter: 店舗数上限は tenant_owner と同じ 5', () => {
      const staff = POLICY_MAP.settings.tenant_staff(makeCtx('tenant_staff', 'starter')).listPermissions()
      const owner = POLICY_MAP.settings.tenant_owner(makeCtx('tenant_owner', 'starter')).listPermissions()
      expect(staff.createShopLimit).toBe(owner.createShopLimit)
    })
  })

  describe('developer', () => {
    it('pro: tenant_owner と同様の設定権限', () => {
      const dev = POLICY_MAP.settings.developer(makeCtx('developer', 'pro')).listPermissions()
      const owner = POLICY_MAP.settings.tenant_owner(makeCtx('tenant_owner', 'pro')).listPermissions()
      expect(dev).toEqual(owner)
    })
  })

  describe('system', () => {
    it('pro: tenant_owner と同様の設定権限', () => {
      const sys = POLICY_MAP.settings.system(makeCtx('system', 'pro')).listPermissions()
      const owner = POLICY_MAP.settings.tenant_owner(makeCtx('tenant_owner', 'pro')).listPermissions()
      expect(sys).toEqual(owner)
    })
  })
})
