import { SELF } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  resetDb,
  createTestJwt,
  authedFetch,
  getDb,
  hashPassword,
  setSubscriptionStatus,
  TEST_USER_ALICE,
  TEST_TENANT_S_ID,
} from '../test/helpers'
import { schema } from '../rdb/index'

describe('POST /api/auth/seed', () => {
  beforeEach(() => resetDb())

  it('200: シードデータを投入して24ユーザーを返す', async () => {
    // まず seed エンドポイントを呼ぶ
    const res = await SELF.fetch('http://localhost/api/auth/seed', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { users: unknown[]; password: string }
    expect(body.users).toHaveLength(24)
    expect(body.password).toBe('password')
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(() => resetDb())

  it('200: 正しいメールとパスワードでJWTトークンを取得', async () => {
    const res = await SELF.fetch('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@test.com', password: 'password' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string; role: string }
    expect(body.token).toBeTruthy()
    expect(body.role).toBe('tenant_owner')
  })

  it('401: 間違いパスワードで認証エラー', async () => {
    const res = await SELF.fetch('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@test.com', password: 'wrongpassword' }),
    })
    expect(res.status).toBe(401)
  })

  it('401: 存在しないメールアドレスで認証エラー', async () => {
    const res = await SELF.fetch('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@test.com', password: 'password' }),
    })
    expect(res.status).toBe(401)
  })

  it('400: バリデーションエラー（メール形式不正）', async () => {
    const res = await SELF.fetch('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'password' }),
    })
    expect(res.status).toBe(400)
  })

  it('400: バリデーションエラー（パスワード空）', async () => {
    const res = await SELF.fetch('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@test.com', password: '' }),
    })
    expect(res.status).toBe(400)
  })

  it('401: tenantId が空のユーザーは「アサインメントなし」', async () => {
    const db = getDb()
    await db
      .insert(schema.adminUsers)
      .values({
        id: 'test-no-tenant',
        email: 'no-tenant@test.com',
        passwordHash: await hashPassword('password'),
        tenantId: '',
        role: 'tenant_owner',
        plan: 'pro',
      })
      .run()
    const res = await SELF.fetch('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'no-tenant@test.com', password: 'password' }),
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { message?: string }
    expect(body.message).toContain('ユーザーにアサインメントがありません')
  })
})

describe('GET /api/auth/me', () => {
  beforeEach(() => resetDb())

  it('200: JWTがあれば自身の情報と権限マップを返す', async () => {
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/auth/me', token)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      id: string
      email: string
      role: string
      plan: string
      permissions: Record<string, unknown>
    }
    expect(body.id).toBe(TEST_USER_ALICE)
    expect(body.role).toBe('tenant_owner')
    expect(body.plan).toBe('pro')
    expect(body.permissions).toBeDefined()
    expect(body.permissions.customer).toBeDefined()
    expect(body.permissions.settings).toBeDefined()
  })

  it('401: JWTなしで認証エラー', async () => {
    const res = await SELF.fetch('http://localhost/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('401: subscription が inactive なら認証エラー', async () => {
    await setSubscriptionStatus(TEST_TENANT_S_ID, 'inactive')
    const token = await createTestJwt(TEST_USER_ALICE, 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/auth/me', token)
    expect(res.status).toBe(401)
    const body = (await res.json()) as { message?: string }
    expect(body.message).toBe('Subscription is not active')
  })

  it('404: JWTの sub が存在しないユーザーなら 404', async () => {
    const token = await createTestJwt('test-nobody', 'tenant_owner', TEST_TENANT_S_ID)
    const res = await authedFetch('/api/auth/me', token)
    expect(res.status).toBe(404)
  })
})

describe('GET /api/auth/demo-users', () => {
  beforeEach(() => resetDb())

  it('200: デモユーザー一覧を返す', async () => {
    const res = await SELF.fetch('http://localhost/api/auth/demo-users')
    expect(res.status).toBe(200)
    const body = (await res.json()) as unknown[]
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
    const first = body[0] as Record<string, unknown>
    expect(first.email).toBeTruthy()
    expect(first.role).toBeTruthy()
    expect(first.plan).toBeTruthy()
    expect(first.tenantName).toBeTruthy()
    expect('shopName' in first).toBe(true)
  })
})
