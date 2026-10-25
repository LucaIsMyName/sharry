import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    globalSetup: './vitest.global-setup.ts',
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.test.tsx', 'scripts/**/*.test.ts'],
  },
})
