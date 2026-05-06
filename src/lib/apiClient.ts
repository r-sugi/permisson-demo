import { hc } from 'hono/client'
import type { AppType } from '@worker/app-type'

/** Hono RPC クライアント（ルート型は Worker の `AppType` と同期） */
export const apiClient = hc<AppType>('/', {
  headers: () => {
    const token = localStorage.getItem('jwt_token')
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    }
  },
})

/** `hc` の `ClientResponse` / 標準 `Response` を従来の `apiFetch` と同様にパース（失敗時は status / body を付与） */
export async function parseJson<T>(res: {
  ok: boolean
  status: number
  json(): Promise<unknown>
}): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: 'Unknown error' }))
    const err = new Error((body as { message?: string }).message ?? 'API error') as Error & {
      status: number
      body: unknown
    }
    err.status = res.status
    err.body = body
    throw err
  }
  return res.json() as Promise<T>
}
