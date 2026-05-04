import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './worker/rdb/models/*.ts',
  out: './worker/rdb/migrations',
  dialect: 'sqlite',
})
