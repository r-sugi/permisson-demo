import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { basicAuthMiddleware } from './basic-auth'
import type { HonoEnv } from '../type'

const TEST_ENV = {
  BASIC_AUTH_USERNAME: 'user',
  BASIC_AUTH_PASSWORD: '12345',
  ASSETS: {
    fetch: async (req: Request) => {
      const url = new URL(req.url)
      if (url.pathname === '/') {
        return new Response('<html>login</html>', { status: 200 })
      }
      return new Response('not found', { status: 404 })
    },
  },
} as HonoEnv['Bindings']

function basicHeader(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`
}

function makeApp() {
  return new Hono<HonoEnv>()
    .use('/login', basicAuthMiddleware())
    .get('/login', async (c) => {
      const indexRequest = new Request(new URL('/', c.req.url), c.req.raw)
      return c.env.ASSETS.fetch(indexRequest)
    })
    .get('/dashboard', (c) => c.text('public'))
}

describe('basicAuthMiddleware', () => {
  it('/login は正しい Basic 認証で SPA を返す', async () => {
    const res = await makeApp().request('/login', {
      headers: { Authorization: basicHeader('user', '12345') },
    }, TEST_ENV)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<html>login</html>')
  })

  it('/login は認証なしだと 401', async () => {
    const res = await makeApp().request('/login', {}, TEST_ENV)
    expect(res.status).toBe(401)
  })

  it('/login 以外は Basic 認証不要', async () => {
    const res = await makeApp().request('/dashboard', {}, TEST_ENV)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('public')
  })
})
