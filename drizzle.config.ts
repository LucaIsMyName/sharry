import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './packages/database/src/schema.ts',
  out: './packages/database/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/linkshortener',
  },
})
