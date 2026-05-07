import { describe, expect, it, vi, beforeEach } from 'vitest'
import { authContextMiddleware } from './auth'
import { AuthContextRepository } from '../repository/auth-context.repository'
import { NotFoundError, SubscriptionInactiveError } from '@shared/error/my-app-error'

type FakeContext = {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
}

function makeCtx(seed: Record<string, unknown>): FakeContext & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>(Object.entries(seed))
  return {
    store,
    get: (k) => store.get(k),
    set: (k, v) => {
      store.set(k, v)
    },
  }
}

describe('authContextMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('subscription が有効なら DB のユーザー情報で auth を注入して next を呼ぶ', async () => {
    vi.spyOn(AuthContextRepository.prototype, 'tryAuthenticateUser').mockResolvedValue({
      result: true,
      plan: 'pro',
      adminUserForAuth: {
        sub: 'u',
        tenantId: 't',
        role: 'tenant_owner',
      },
    })

    const c = makeCtx({
      jwtPayload: { sub: 'u', role: 'tenant_owner', tenantId: 't' },
      db: {},
    })
    const next = vi.fn(async () => {})

    await authContextMiddleware(c as never, next as never)

    expect(next).toHaveBeenCalledTimes(1)
    expect(c.store.get('auth')).toEqual({
      userId: 'u',
      tenantId: 't',
      role: 'tenant_owner',
      plan: 'pro',
    })
  })

  it('adminUsers が存在しなければ 404', async () => {
    vi.spyOn(AuthContextRepository.prototype, 'tryAuthenticateUser').mockResolvedValue({
      result: false,
      error: 'user_not_found',
    })

    const c = makeCtx({
      jwtPayload: { sub: 'u', role: 'tenant_owner', tenantId: 't' },
      db: {},
    })
    const next = vi.fn(async () => {})

    await expect(authContextMiddleware(c as never, next as never)).rejects.toBeInstanceOf(
      NotFoundError,
    )
    await expect(authContextMiddleware(c as never, next as never)).rejects.toMatchObject({
      status: 404,
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('subscription が無効なら 403', async () => {
    vi.spyOn(AuthContextRepository.prototype, 'tryAuthenticateUser').mockResolvedValue({
      result: false,
      error: 'subscription_inactive',
    })

    const c = makeCtx({
      jwtPayload: { sub: 'u', role: 'tenant_owner', tenantId: 't' },
      db: {},
    })
    const next = vi.fn(async () => {})

    await expect(authContextMiddleware(c as never, next as never)).rejects.toBeInstanceOf(
      SubscriptionInactiveError,
    )
    await expect(authContextMiddleware(c as never, next as never)).rejects.toMatchObject({
      status: 403,
    })
    expect(next).not.toHaveBeenCalled()
  })
})
