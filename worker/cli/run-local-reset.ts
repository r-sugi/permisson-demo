import { openDb } from './_db'
import { resetAllTables } from './_reset'

function reset() {
  const { sqlite, db } = openDb()
  resetAllTables(db)
  sqlite.close()
  console.log('リセット完了')
}

try {
  reset()
} catch (err) {
  console.error(err)
  process.exit(1)
}
