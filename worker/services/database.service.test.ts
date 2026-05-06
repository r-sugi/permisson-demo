import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('createDatabaseConnection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('NODE_ENV=production なら wrapD1ForSqlTiming を呼ばない', async () => {
    process.env.NODE_ENV = 'production'

    const wrapSpy = vi.fn((db: unknown) => db)
    vi.doMock('./d1-sql-timing-proxy', () => ({ wrapD1ForSqlTiming: wrapSpy }))

    const { createDatabaseConnection } = await import('./database.service')

    const db = {} as unknown as D1Database
    const out = createDatabaseConnection(db)

    expect(out).toBeTruthy()
    expect(wrapSpy).not.toHaveBeenCalled()
  })

  it('NODE_ENV!=production なら wrapD1ForSqlTiming を呼ぶ', async () => {
    process.env.NODE_ENV = 'test'

    const wrapSpy = vi.fn((db: unknown) => db)
    vi.doMock('./d1-sql-timing-proxy', () => ({ wrapD1ForSqlTiming: wrapSpy }))

    const { createDatabaseConnection } = await import('./database.service')

    const db = {} as unknown as D1Database
    createDatabaseConnection(db)

    expect(wrapSpy).toHaveBeenCalledTimes(1)
  })
})
