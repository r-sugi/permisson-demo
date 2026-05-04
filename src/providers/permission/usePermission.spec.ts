import { describe, it, expect, vi, type MockedFunction } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePermission } from './usePermission'
import { usePermissionContext } from './permissionContext'
import type { MeData } from './permissionContext'
import { SHOP_LIMIT_UNLIMITED } from 'shared/permission/types'

vi.mock('./permissionContext')

const mockUsePermissionContext = usePermissionContext as MockedFunction<typeof usePermissionContext>

function makeMe(partial: Partial<MeData>): MeData {
  const base: MeData = {
    id: 'user-1',
    email: 'test@example.com',
    role: 'tenant_owner',
    plan: 'pro',
    tenantName: 'Test',
    shopScope: '全て',
    permissions: {
      customer: {
        create: true,
        read: true,
        update: true,
        delete: true,
        exportCsv: true,
      },
      settings: {
        createShop: true,
        updateShop: true,
        deleteShop: true,
        createShopLimit: SHOP_LIMIT_UNLIMITED,
      },
      shop: { read: true },
    },
  }
  return {
    ...base,
    ...partial,
    tenantName: partial.tenantName !== undefined ? partial.tenantName : base.tenantName,
    shopScope: partial.shopScope !== undefined ? partial.shopScope : base.shopScope,
    permissions: partial.permissions ?? base.permissions,
  }
}

describe('usePermission', () => {
  it('tenant_owner / pro: customer.read = true', () => {
    mockUsePermissionContext.mockReturnValue({
      me: makeMe({}),
      loading: false,
      refetchMe: vi.fn(),
      logout: vi.fn(),
    })

    const { result } = renderHook(() => usePermission())
    expect(result.current.hasPermission('customer', 'read')).toBe(true)
    expect(result.current.hasPermission('customer', 'create')).toBe(true)
    expect(result.current.hasPermission('customer', 'delete')).toBe(true)
    expect(result.current.hasPermission('customer', 'exportCsv')).toBe(true)
  })

  it('shop_staff: customer.read = false', () => {
    mockUsePermissionContext.mockReturnValue({
      me: makeMe({
        role: 'shop_staff',
        plan: 'pro',
        permissions: {
          customer: { create: false, read: false, update: false, delete: false, exportCsv: false },
          settings: { createShop: false, updateShop: false, deleteShop: false, createShopLimit: 0 },
          shop: { read: true },
        },
      }),
      loading: false,
      refetchMe: vi.fn(),
      logout: vi.fn(),
    })

    const { result } = renderHook(() => usePermission())
    expect(result.current.hasPermission('customer', 'read')).toBe(false)
    expect(result.current.hasPermission('customer', 'create')).toBe(false)
    expect(result.current.hasPermission('settings', 'createShop')).toBe(false)
    expect(result.current.isCreateShopLimitUnlimited).toBe(false)
    expect(result.current.createShopLimit).toBe(0)
  })

  it('tenant_owner / basic: 店舗上限30', () => {
    mockUsePermissionContext.mockReturnValue({
      me: makeMe({
        plan: 'basic',
        permissions: {
          customer: { create: true, read: true, update: true, delete: true, exportCsv: true },
          settings: { createShop: true, updateShop: true, deleteShop: true, createShopLimit: 30 },
          shop: { read: true },
        },
      }),
      loading: false,
      refetchMe: vi.fn(),
      logout: vi.fn(),
    })

    const { result } = renderHook(() => usePermission())
    expect(result.current.hasPermission('customer', 'exportCsv')).toBe(true)
    expect(result.current.createShopLimit).toBe(30)
    expect(result.current.isCreateShopLimitUnlimited).toBe(false)
  })

  it('me が null の場合：全権限 false', () => {
    mockUsePermissionContext.mockReturnValue({
      me: null,
      loading: true,
      refetchMe: vi.fn(),
      logout: vi.fn(),
    })

    const { result } = renderHook(() => usePermission())
    expect(result.current.hasPermission('customer', 'read')).toBe(false)
    expect(result.current.permissions).toBeNull()
    expect(result.current.createShopLimit).toBe(0)
  })
})
