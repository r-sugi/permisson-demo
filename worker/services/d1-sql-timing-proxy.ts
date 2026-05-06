import { logRailsLikeSqlQuery, roundDurationMs } from './rails-like-sql-logger'

/** D1 の応答から DB 側の実行時間が取れればそれを優先（なければフォールバック） */
function resolvedDurationMs(result: unknown, wallMs: number): number {
  if (result !== null && typeof result === 'object' && 'meta' in result) {
    const meta = (
      result as { meta?: { duration?: number; timings?: { sql_duration_ms?: number } } }
    ).meta
    if (meta?.timings?.sql_duration_ms != null) {
      return roundDurationMs(meta.timings.sql_duration_ms)
    }
    if (typeof meta?.duration === 'number') {
      return roundDurationMs(meta.duration)
    }
  }
  return roundDurationMs(wallMs)
}

function wrapBoundStatement(
  bound: D1PreparedStatement,
  sqlText: string,
  bindArgs: unknown[],
): D1PreparedStatement {
  const execMethods = new Set(['run', 'all', 'first'])

  return new Proxy(bound, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (prop === 'bind' && typeof value === 'function') {
        return (...extra: unknown[]) =>
          wrapBoundStatement(value.apply(target, extra), sqlText, [...bindArgs, ...extra])
      }
      if (prop === 'raw' && typeof value === 'function') {
        return (...args: unknown[]) => {
          const t0 = performance.now()
          return Promise.resolve(value.apply(target, args)).finally(() => {
            logRailsLikeSqlQuery(sqlText, bindArgs, roundDurationMs(performance.now() - t0))
          })
        }
      }
      if (execMethods.has(prop as string) && typeof value === 'function') {
        return (...args: unknown[]) => {
          const t0 = performance.now()
          return Promise.resolve(value.apply(target, args)).then(
            (result) => {
              logRailsLikeSqlQuery(
                sqlText,
                bindArgs,
                resolvedDurationMs(result, performance.now() - t0),
              )
              return result
            },
            (err) => {
              logRailsLikeSqlQuery(sqlText, bindArgs, roundDurationMs(performance.now() - t0))
              throw err
            },
          )
        }
      }
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as D1PreparedStatement
}

function wrapStatement(stmt: D1PreparedStatement, sqlText: string): D1PreparedStatement {
  return new Proxy(stmt, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (prop === 'bind' && typeof value === 'function') {
        return (...args: unknown[]) => wrapBoundStatement(value.apply(target, args), sqlText, args)
      }
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as D1PreparedStatement
}

async function timed<T>(run: () => Promise<T>, log: (ms: number) => void): Promise<T> {
  const t0 = performance.now()
  try {
    return await run()
  } finally {
    log(performance.now() - t0)
  }
}

/**
 * Drizzle の Logger は実行前に logQuery されるため実時間が取れない。
 * D1 の prepare → bind → run/all/raw/first をラップして計測する。
 */
export function wrapD1ForSqlTiming(db: D1Database): D1Database {
  return new Proxy(db, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (prop === 'prepare' && typeof value === 'function') {
        return (sqlText: string) => wrapStatement(value.call(target, sqlText), sqlText)
      }
      if (prop === 'batch' && typeof value === 'function') {
        return (statements: D1PreparedStatement[]) =>
          timed(
            () => value.call(target, statements),
            (wallMs) =>
              logRailsLikeSqlQuery(
                `/* d1 batch: ${statements.length} statements */`,
                [],
                roundDurationMs(wallMs),
              ),
          )
      }
      if (prop === 'exec' && typeof value === 'function') {
        return (sqlText: string) =>
          timed(
            () => value.call(target, sqlText),
            (wallMs) => logRailsLikeSqlQuery(sqlText, [], roundDurationMs(wallMs)),
          )
      }
      if (typeof value === 'function') {
        return value.bind(target)
      }
      return value
    },
  }) as D1Database
}
