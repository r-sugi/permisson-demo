import { describe, expect, it, vi, beforeEach } from 'vitest'
import { HTTPException } from 'hono/http-exception'
import { authContextMiddleware } from './auth'
import { SubscriptionRepository } from '../repository/subscription.repository'

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

  it('subscription が有効なら auth を注入して next を呼ぶ', async () => {
    vi.spyOn(SubscriptionRepository.prototype, 'findValidByTenantId').mockResolvedValue({
      id: 'sub',
      tenantId: 't',
      plan: 'pro',
      status: 'active',
    } as never)

    const mockGet = vi.fn().mockResolvedValue({ plan: 'pro' })
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({ get: mockGet }),
        }),
      }),
    }

    const c = makeCtx({
      jwtPayload: { sub: 'u', role: 'tenant_owner', tenantId: 't' },
      db: mockDb,
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
    vi.spyOn(SubscriptionRepository.prototype, 'findValidByTenantId').mockResolvedValue({
      id: 'sub',
      tenantId: 't',
      plan: 'pro',
      status: 'active',
    } as never)

    const mockGet = vi.fn().mockResolvedValue(null)
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({ get: mockGet }),
        }),
      }),
    }

    const c = makeCtx({
      jwtPayload: { sub: 'u', role: 'tenant_owner', tenantId: 't' },
      db: mockDb,
    })
    const next = vi.fn(async () => {})

    await expect(authContextMiddleware(c as never, next as never)).rejects.toBeInstanceOf(
      HTTPException,
    )
    await expect(authContextMiddleware(c as never, next as never)).rejects.toMatchObject({
      status: 404,
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('subscription が無効なら 401', async () => {
    vi.spyOn(SubscriptionRepository.prototype, 'findValidByTenantId').mockResolvedValue(
      null as never,
    )

    const c = makeCtx({
      jwtPayload: { sub: 'u', role: 'tenant_owner', tenantId: 't' },
      db: {},
    })
    const next = vi.fn(async () => {})

    await expect(authContextMiddleware(c as never, next as never)).rejects.toBeInstanceOf(
      HTTPException,
    )
    await expect(authContextMiddleware(c as never, next as never)).rejects.toMatchObject({
      status: 401,
    })
    expect(next).not.toHaveBeenCalled()
  })
})
