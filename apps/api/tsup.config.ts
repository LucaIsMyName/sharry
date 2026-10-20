import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  noExternal: ['@sharry/shared', '@sharry/database'],
  external: ['qrcode', 'pg', 'drizzle-orm'],
})
