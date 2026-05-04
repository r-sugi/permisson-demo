import { describe, it, expect, vi, type MockedFunction } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PermissionPanel } from './PermissionPanel'
import { usePermissionContext } from '@/providers/permission/permissionContext'
import { usePermission } from '@/providers/permission/usePermission'
import type { MeData } from '@/providers/permission/permissionContext'
import { SHOP_LIMIT_UNLIMITED } from '@shared/permission/types'

vi.mock('@/providers/permission/permissionContext')
vi.mock('@/providers/permission/usePermission')

const mockUsePermissionContext = usePermissionContext as MockedFunction<typeof usePermissionContext>
const mockUsePermission = usePermission as MockedFunction<typeof usePermission>

const tenantOwnerProMe: MeData = {
  id: 'user-1',
  email: 'alice@example.com',
  role: 'tenant_owner',
  plan: 'pro',
  tenantName: 'A社',
  shopScope: '全て',
  permissions: {
    customer: { create: true, read: true, update: true, delete: true, exportCsv: true },
    settings: { createShop: true, updateShop: true, deleteShop: true, createShopLimit: SHOP_LIMIT_UNLIMITED },
    shop: { read: true },
  },
}

const shopStaffMe: MeData = {
  id: 'user-2',
  email: 'henry@example.com',
  role: 'shop_staff',
  plan: 'pro',
  tenantName: 'A社',
  shopScope: 'A社 渋谷店',
  permissions: {
    customer: { create: false, read: false, update: false, delete: false, exportCsv: false },
    settings: { createShop: false, updateShop: false, deleteShop: false, createShopLimit: 0 },
    shop: { read: true },
  },
}

const ITEMS = [
  { label: '顧客閲覧', target: 'customer' as const, action: 'read' },
  { label: '顧客作成', target: 'customer' as const, action: 'create' },
  { label: 'CSV出力', target: 'customer' as const, action: 'exportCsv' },
]

describe('PermissionPanel', () => {
  it('tenant_owner / pro: 全権限が ✅ で表示される', () => {
    mockUsePermissionContext.mockReturnValue({
      me: tenantOwnerProMe,
      loading: false,
      refetchMe: vi.fn(),
      logout: vi.fn(),
    })
    mockUsePermission.mockReturnValue({
      permissions: tenantOwnerProMe.permissions,
      hasPermission: (target, action) => {
        return (tenantOwnerProMe.permissions[target] as Record<string, unknown>)[action] === true
      },
      createShopLimit: SHOP_LIMIT_UNLIMITED,
      isCreateShopLimitUnlimited: true,
    })

    render(<PermissionPanel items={ITEMS} />)

    expect(screen.getByText('テナントオーナー')).toBeInTheDocument()
    expect(screen.getByText('Pro')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    // ✅ バッジが表示されていることを確認
    const badges = screen.getAllByText('✅')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('shop_staff: 全権限が ❌ で表示される', () => {
    mockUsePermissionContext.mockReturnValue({
      me: shopStaffMe,
      loading: false,
      refetchMe: vi.fn(),
      logout: vi.fn(),
    })
    mockUsePermission.mockReturnValue({
      permissions: shopStaffMe.permissions,
      hasPermission: (_target, _action) => false,
      createShopLimit: 0,
      isCreateShopLimitUnlimited: false,
    })

    render(<PermissionPanel items={ITEMS} />)

    expect(screen.getByText('店舗スタッフ')).toBeInTheDocument()
    const badgeNoes = screen.getAllByText('❌')
    expect(badgeNoes.length).toBeGreaterThan(0)
  })

  it('me が null の場合は何も表示しない', () => {
    mockUsePermissionContext.mockReturnValue({
      me: null,
      loading: false,
      refetchMe: vi.fn(),
      logout: vi.fn(),
    })
    mockUsePermission.mockReturnValue({
      permissions: null,
      hasPermission: () => false,
      createShopLimit: 0,
      isCreateShopLimitUnlimited: false,
    })

    const { container } = render(<PermissionPanel items={ITEMS} />)
    expect(container.firstChild).toBeNull()
  })
})
