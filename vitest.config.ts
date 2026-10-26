import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(import.meta.dirname, 'apps/web/src'),
    },
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    globalSetup: './vitest.global-setup.ts',
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ['default', './scripts/test-results-reporter.ts'],
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.test.tsx', 'scripts/**/*.test.ts'],
  },
})
