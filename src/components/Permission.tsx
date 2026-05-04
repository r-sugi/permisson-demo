import type { ReactNode } from 'react'
import { usePermission } from '@/providers/permission/usePermission'
import type { PolicyTarget } from 'shared/permission/policy/context'

type Props = {
  target: PolicyTarget
  action: string
  children: ReactNode
  fallback?: ReactNode
}

export function Permission({ target, action, children, fallback = null }: Props) {
  const { hasPermission } = usePermission()
  return hasPermission(target, action) ? <>{children}</> : <>{fallback}</>
}
