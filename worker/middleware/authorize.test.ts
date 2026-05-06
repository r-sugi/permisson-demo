import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { HonoEnv } from '../type'
import type { AuthContext } from '@shared/permission/types'
import type { Repositories } from '@shared/permission/scope/resolver-types'
import type { GateRelationResolver } from '@shared/permission/scope/resolver-types'
import type { PolicyOption } from '@shared/permission/policy/context'
import { authorize } from './authorize'

const mockRepos: Repositories = {
  shopAssignment: {
    findByUserIdAndShopId: async () => null,
  },
  shop: {
    findById: async () => null,
  },
  purchaseHistory: {
    findByCustomerId: async () => null,
    evaluateCustomerShopAccess: async () => null,
  },
}

function testApp(auth: AuthContext, routes: (app: Hono<HonoEnv>) => void) {
  const app = new Hono<HonoEnv>()
  app.use('*', async (c, next) => {
    c.set('auth', auth)
    c.set('repo', mockRepos)
    // authorize は db / useCase を参照しない
    c.set('db', {} as HonoEnv['Variables']['db'])
    c.set('useCase', {} as HonoEnv['Variables']['useCase'])
    await next()
  })
  routes(app)
  return app
}

describe('authorize middleware', () => {
  describe('policy / relation どちらも無い場合（fallback-deny）', () => {
    it('403 — 型をすり抜けた不正呼び出しも実行時で拒否', async () => {
      const auth: AuthContext = {
        userId: 'u',
        tenantId: 't',
        role: 'tenant_owner',
        plan: 'pro',
      }
      const app = testApp(auth, (a) =>
        a.get(
          '/empty-authz',
          // 実行時ガードのテスト: 素の {} は型で弾かれるためキャストして誤設定をシミュレートする
          authorize({} as Parameters<typeof authorize>[0]),
          (c) => c.json({ ok: true }),
        ),
      )
      const res = await app.request('/empty-authz')
      expect(res.status).toBe(403)
      expect(await res.text()).toContain('requires policy and/or relation')
    })
  })

  describe('policy のみ', () => {
    it('許可アクションなら 200', async () => {
      const auth: AuthContext = {
        userId: 'u',
        tenantId: 't',
        role: 'tenant_owner',
        plan: 'pro',
      }
      const app = testApp(auth, (a) =>
        a.get('/ok', authorize({ policy: { target: 'customer', action: 'read' } }), (c) =>
          c.json({ ok: true }),
        ),
      )
      const res = await app.request('/ok')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    })

    it('不許可アクションなら 403 と Permission denied メッセージ', async () => {
      const auth: AuthContext = {
        userId: 'u',
        tenantId: 't',
        role: 'shop_staff',
        plan: 'pro',
      }
      const app = testApp(auth, (a) =>
        a.get('/deny', authorize({ policy: { target: 'customer', action: 'read' } }), (c) =>
          c.json({ ok: true }),
        ),
      )
      const res = await app.request('/deny')
      expect(res.status).toBe(403)
      expect(await res.text()).toContain('Permission denied: customer.read')
    })

    it('ポリシーに存在しない action キーは 403', async () => {
      const auth: AuthContext = {
        userId: 'u',
        tenantId: 't',
        role: 'tenant_owner',
        plan: 'pro',
      }
      const app = testApp(auth, (a) =>
        a.get(
          '/bad-action',
          authorize({
            policy: {
              target: 'customer',
              action: 'nonexistentAction',
            } as unknown as PolicyOption,
          }),
          (c) => c.json({ ok: true }),
        ),
      )
      const res = await app.request('/bad-action')
      expect(res.status).toBe(403)
      expect(await res.text()).toContain('Permission denied: customer.nonexistentAction')
    })
  })

  describe('relation のみ', () => {
    it('resolver が true なら 200', async () => {
      const auth: AuthContext = {
        userId: 'u',
        tenantId: 't',
        role: 'tenant_owner',
        plan: 'pro',
      }
      const app = testApp(auth, (a) =>
        a.get(
          '/rel-ok',
          authorize({
            relation: {
              resolver: (): GateRelationResolver => async () => true,
            },
          }),
          (c) => c.json({ ok: true }),
        ),
      )
      const res = await app.request('/rel-ok')
      expect(res.status).toBe(200)
    })

    it('resolver が false なら 404', async () => {
      const auth: AuthContext = {
        userId: 'u',
        tenantId: 't',
        role: 'tenant_owner',
        plan: 'pro',
      }
      const app = testApp(auth, (a) =>
        a.get(
          '/rel-deny',
          authorize({
            relation: {
              resolver: (): GateRelationResolver => async () => false,
            },
          }),
          (c) => c.json({ ok: true }),
        ),
      )
      const res = await app.request('/rel-deny')
      expect(res.status).toBe(404)
      expect(await res.text()).toContain('Not Found')
    })
  })

  describe('policy + relation', () => {
    it('PBAC 失敗時は GateRelationResolver が呼ばれない', async () => {
      const relationSpy = vi.fn(async (): Promise<boolean> => true)
      const auth: AuthContext = {
        userId: 'u',
        tenantId: 't',
        role: 'shop_staff',
        plan: 'pro',
      }
      const app = testApp(auth, (a) =>
        a.get(
          '/both',
          authorize({
            policy: { target: 'customer', action: 'read' },
            relation: {
              resolver: () => relationSpy,
            },
          }),
          (c) => c.json({ ok: true }),
        ),
      )
      const res = await app.request('/both')
      expect(res.status).toBe(403)
      expect(relationSpy).not.toHaveBeenCalled()
    })

    it('PBAC 成功・ReBAC 失敗なら 404', async () => {
      const auth: AuthContext = {
        userId: 'u',
        tenantId: 't',
        role: 'tenant_owner',
        plan: 'pro',
      }
      const app = testApp(auth, (a) =>
        a.get(
          '/rebac-fail',
          authorize({
            policy: { target: 'customer', action: 'read' },
            relation: {
              resolver: (): GateRelationResolver => async () => false,
            },
          }),
          (c) => c.json({ ok: true }),
        ),
      )
      const res = await app.request('/rebac-fail')
      expect(res.status).toBe(404)
    })

    it('両方成功なら 200', async () => {
      const auth: AuthContext = {
        userId: 'u',
        tenantId: 't',
        role: 'tenant_owner',
        plan: 'pro',
      }
      const app = testApp(auth, (a) =>
        a.get(
          '/both-ok',
          authorize({
            policy: { target: 'customer', action: 'read' },
            relation: {
              resolver: (): GateRelationResolver => async () => true,
            },
          }),
          (c) => c.json({ ok: true }),
        ),
      )
      const res = await app.request('/both-ok')
      expect(res.status).toBe(200)
    })
  })
})
