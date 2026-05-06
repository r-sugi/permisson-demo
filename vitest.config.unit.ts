import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['worker/**/*.test.ts', 'shared/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['worker/**/*.ts', 'shared/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.e2e-spec.ts',
        'worker/test/**',
        'worker/cli/**',
        'worker/rdb/migrations/**',
        'worker/rdb/models/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@worker': fileURLToPath(new URL('./worker', import.meta.url)),
    },
  },
})
