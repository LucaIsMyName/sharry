import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  noExternal: ['@sharry/shared', '@sharry/database'],
  // undici uses Node's require(). Bundling it into this ESM build crashes startup
  // with "Dynamic require of assert is not supported".
  external: ['qrcode', 'pg', 'drizzle-orm', 'undici'],
})
