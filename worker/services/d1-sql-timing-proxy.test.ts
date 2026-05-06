import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('wrapD1ForSqlTiming', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('prepare().bind().run() で SQL ログが呼ばれる（meta.timings 優先）', async () => {
    const logSpy = vi.fn()
    vi.doMock('./rails-like-sql-logger', async () => {
      const actual =
        await vi.importActual<typeof import('./rails-like-sql-logger')>('./rails-like-sql-logger')
      return {
        ...actual,
        logRailsLikeSqlQuery: (...args: unknown[]) => {
          logSpy(...args)
        },
      }
    })
    const { wrapD1ForSqlTiming } = await import('./d1-sql-timing-proxy')

    const stmt = {
      bind: function bind() {
        return this
      },
      run: async () => ({ meta: { timings: { sql_duration_ms: 12.34 } } }),
    }

    const db = {
      prepare: () => stmt,
    }

    const wrapped = wrapD1ForSqlTiming(db as never)
    await wrapped.prepare('select 1 where a = ?').bind(1).run()

    expect(logSpy).toHaveBeenCalledTimes(1)
    const [sqlText, bindArgs, durationMs] = logSpy.mock.calls[0] as [string, unknown[], number]
    expect(sqlText).toBe('select 1 where a = ?')
    expect(bindArgs).toEqual([1])
    expect(durationMs).toBe(12.3)
  })

  it('exec/batch もラップされる', async () => {
    const logSpy = vi.fn()
    vi.doMock('./rails-like-sql-logger', async () => {
      const actual =
        await vi.importActual<typeof import('./rails-like-sql-logger')>('./rails-like-sql-logger')
      return {
        ...actual,
        logRailsLikeSqlQuery: (...args: unknown[]) => {
          logSpy(...args)
        },
      }
    })
    const { wrapD1ForSqlTiming } = await import('./d1-sql-timing-proxy')

    const db = {
      exec: async () => undefined,
      batch: async () => [],
      prepare: () => ({
        bind: function bind() {
          return this
        },
        run: async () => ({}),
      }),
    }

    const wrapped = wrapD1ForSqlTiming(db as never)
    await wrapped.exec('select 1')
    await wrapped.batch([] as never)

    expect(logSpy).toHaveBeenCalled()
  })
})
