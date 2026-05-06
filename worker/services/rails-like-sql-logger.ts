/** ActiveSupport::LogSubscriber と同系の ANSI 色 */
const BOLD = '\u001B[1m'
const CLEAR = '\u001B[0m'
const RED = '\u001B[31m'
const GREEN = '\u001B[32m'
const YELLOW = '\u001B[33m'
const BLUE = '\u001B[34m'
const MAGENTA = '\u001B[35m'
const CYAN = '\u001B[36m'
const WHITE = '\u001B[37m'

function color(text: string, ansi: string, bold: boolean): string {
  const b = bold ? BOLD : ''
  return `${b}${ansi}${text}${CLEAR}`
}

/** ActiveRecord::LogSubscriber#sql_color に相当 */
function sqlColor(sql: string): string {
  const head = sql.trimStart()
  const match = head.match(/^(\w+)(?:\s|$)/)
  if (match) {
    switch (match[1].toLowerCase()) {
      case 'rollback':
        return RED
      case 'lock':
        return WHITE
      case 'select':
        return /for update/i.test(sql) ? WHITE : BLUE
      case 'insert':
        return GREEN
      case 'update':
        return YELLOW
      case 'delete':
        return RED
      default:
        break
    }
  }
  if (/\btransaction\s*$/i.test(sql.trim())) {
    return CYAN
  }
  return MAGENTA
}

/** Rails の duration_ms.round(1) に相当 */
export function roundDurationMs(ms: number): number {
  return Math.round(ms * 10) / 10
}

/** マゼンタ太字の `SQL (1.2ms)`（Rails のクエリ名行に近い） */
function formatLabel(durationMs: number): string {
  const rounded = roundDurationMs(durationMs)
  return color(`SQL (${rounded}ms)`, MAGENTA, true)
}

/** Rails の SQL ログ行 ` #{name} #{sql}#{binds}` に近い整形 */
export function logRailsLikeSqlQuery(query: string, params: unknown[], durationMs: number): void {
  const sqlPart = color(query, sqlColor(query), true)
  const binds = params.length > 0 ? ` ${JSON.stringify(params)}` : ''
  console.info(`  ${formatLabel(durationMs)} ${sqlPart}${binds}`)
}
