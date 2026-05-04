import { applyD1Migrations, env } from 'cloudflare:test'

// setupFiles は各テストファイルの前に実行される
// applyD1Migrations は未適用のマイグレーションのみ適用するため複数回呼んでも安全
await applyD1Migrations(
  (env as typeof env & { DB: D1Database }).DB,
  (
    env as typeof env & {
      TEST_MIGRATIONS: import('@cloudflare/vitest-pool-workers').D1Migration[]
    }
  ).TEST_MIGRATIONS,
)
