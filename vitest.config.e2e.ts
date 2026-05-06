import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrationsPath = path.join(import.meta.dirname, 'worker/rdb/migrations')
  const migrations = await readD1Migrations(migrationsPath)

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            JWT_SECRET: 'test-secret-do-not-use-in-production',
            SEED_CUSTOMER_COUNT: '10000',
          },
        },
      }),
    ],
    resolve: {
      alias: {
        '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
        '@worker': fileURLToPath(new URL('./worker', import.meta.url)),
      },
    },
    test: {
      globals: true,
      include: ['worker/**/*.e2e-spec.ts'],
      testTimeout: 60000,
      setupFiles: ['./worker/test/apply-migrations.ts'],
    },
  }
})
