import { useState, useEffect, useCallback } from 'react'
import { PermissionContext, type MeData } from './permissionContext'
import { apiClient, parseJson } from '@/lib/apiClient'

type Props = { children: React.ReactNode }

export function PermissionProvider({ children }: Props) {
  const [me, setMe] = useState<MeData | null>(null)
  const [loading, setLoading] = useState(true)

  const refetchMe = useCallback(async () => {
    const token = localStorage.getItem('jwt_token')
    if (!token) {
      setMe(null)
      setLoading(false)
      return
    }
    try {
      const res = await apiClient.api.auth.me.$get()
      const data = await parseJson<MeData>(res)
      setMe(data)
    } catch {
      localStorage.removeItem('jwt_token')
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('jwt_token')
    setMe(null)
  }, [])

  useEffect(() => {
    void refetchMe()
  }, [refetchMe])

  return (
    <PermissionContext.Provider value={{ me, loading, refetchMe, logout }}>
      {children}
    </PermissionContext.Provider>
  )
}
