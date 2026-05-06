import { describe, expect, it, vi } from 'vitest'
import { logRailsLikeSqlQuery, roundDurationMs } from './rails-like-sql-logger'

describe('rails-like-sql-logger', () => {
  it('roundDurationMs: 小数第1位に丸める', () => {
    expect(roundDurationMs(1.04)).toBe(1)
    expect(roundDurationMs(1.05)).toBe(1.1)
    expect(roundDurationMs(1.06)).toBe(1.1)
  })

  it('logRailsLikeSqlQuery: query と binds を出力する', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logRailsLikeSqlQuery('select * from t where id = ?', [123], 1.23)

    expect(spy).toHaveBeenCalledTimes(1)
    const msg = String(spy.mock.calls[0]?.[0] ?? '')
    expect(msg).toContain('SQL (')
    expect(msg).toContain('select * from t where id = ?')
    expect(msg).toContain('[123]')
  })
})
