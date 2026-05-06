import { describe, it, expect, vi, type MockedFunction } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Permission } from './Permission'
import { usePermission } from '@/providers/permission/usePermission'

vi.mock('@/providers/permission/usePermission')

const mockUsePermission = usePermission as MockedFunction<typeof usePermission>

function makeUsePermissionReturn(hasPermission: boolean) {
  return {
    permissions: null,
    hasPermission: vi.fn().mockReturnValue(hasPermission),
    createShopLimit: 0,
    isCreateShopLimitUnlimited: false,
  }
}

describe('Permission', () => {
  it('権限がある場合：children を表示する', () => {
    mockUsePermission.mockReturnValue(makeUsePermissionReturn(true))

    render(
      <Permission target="customer" action="read">
        <span>顧客一覧ボタン</span>
      </Permission>,
    )
    expect(screen.getByText('顧客一覧ボタン')).toBeInTheDocument()
  })

  it('権限がない場合：children を表示しない', () => {
    mockUsePermission.mockReturnValue(makeUsePermissionReturn(false))

    render(
      <Permission target="customer" action="create">
        <span>作成ボタン</span>
      </Permission>,
    )
    expect(screen.queryByText('作成ボタン')).not.toBeInTheDocument()
  })

  it('権限がない場合：fallback を表示する', () => {
    mockUsePermission.mockReturnValue(makeUsePermissionReturn(false))

    render(
      <Permission target="customer" action="delete" fallback={<span>削除権限なし</span>}>
        <button type="button">削除</button>
      </Permission>,
    )
    expect(screen.getByText('削除権限なし')).toBeInTheDocument()
    expect(screen.queryByText('削除')).not.toBeInTheDocument()
  })

  it('権限がある場合：fallback を表示しない', () => {
    mockUsePermission.mockReturnValue(makeUsePermissionReturn(true))

    render(
      <Permission target="customer" action="read" fallback={<span>権限なし</span>}>
        <button type="button">閲覧</button>
      </Permission>,
    )
    expect(screen.getByText('閲覧')).toBeInTheDocument()
    expect(screen.queryByText('権限なし')).not.toBeInTheDocument()
  })
})
