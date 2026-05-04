import { createContext, useContext } from 'react'
import type { PermissionsMap } from '@shared/permission/permissions'
import type { Role, Plan } from '@shared/permission/types'

export type MeData = {
  id: string
  email: string
  role: Role
  plan: Plan
  tenantName: string | null
  shopScope: string
  permissions: PermissionsMap
}

export type PermissionContextValue = {
  me: MeData | null
  loading: boolean
  refetchMe: () => Promise<void>
  logout: () => void
}

export const PermissionContext = createContext<PermissionContextValue | null>(null)

export function usePermissionContext(): PermissionContextValue {
  const ctx = useContext(PermissionContext)
  if (!ctx) throw new Error('usePermissionContext must be used within PermissionProvider')
  return ctx
}
