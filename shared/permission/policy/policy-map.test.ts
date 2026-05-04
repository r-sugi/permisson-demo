import { describe, it, expect } from 'vitest'
import { POLICY_MAP } from './context'
import type { PolicyContext } from '../types'

function makeCtx(role: string, plan: string): PolicyContext {
  return { role: role as PolicyContext['role'], plan: plan as PolicyContext['plan'], shop_ids: [] }
}

describe('POLICY_MAP - customer', () => {
  describe('tenant_owner', () => {
    it('pro: 全操作可 + CSV無制限', () => {
      const perms = POLICY_MAP.customer.tenant_owner(makeCtx('tenant_owner', 'pro')).listPermissions()
      expect(perms.create).toBe(true)
      expect(perms.read).toBe(true)
      expect(perms.update).toBe(true)
      expect(perms.delete).toBe(true)
      expect(perms.exportCsv).toBe(true)
      expect(perms.exportCsvLimit).toBe(Number.MAX_SAFE_INTEGER)
    })

    it('basic: 全操作可 + CSV月100件', () => {
      const perms = POLICY_MAP.customer.tenant_owner(makeCtx('tenant_owner', 'basic')).listPermissions()
      expect(perms.exportCsv).toBe(true)
      expect(perms.exportCsvLimit).toBe(100)
    })

    it('starter: 全操作可 + CSV不可', () => {
      const perms = POLICY_MAP.customer.tenant_owner(makeCtx('tenant_owner', 'starter')).listPermissions()
      expect(perms.create).toBe(true)
      expect(perms.exportCsv).toBe(false)
      expect(perms.exportCsvLimit).toBe(0)
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

    it('basic: CSV月100件', () => {
      const perms = POLICY_MAP.customer.shop_owner(makeCtx('shop_owner', 'basic')).listPermissions()
      expect(perms.exportCsv).toBe(true)
      expect(perms.exportCsvLimit).toBe(100)
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
})
