import fs from 'node:fs'
import { defineConfig } from 'drizzle-kit'
import { chooseEnvFile, parseEnvFile } from '@sharry/shared'

const envFile = chooseEnvFile('development', {
  override: process.env.SHARRY_ENV_FILE,
  development: fs.existsSync('.env.development'),
  legacy: fs.existsSync('.env'),
})
if (fs.existsSync(envFile)) {
  const parsed = parseEnvFile(fs.readFileSync(envFile, 'utf8'))
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
}

export default defineConfig({
  schema: './packages/database/src/schema.ts',
  out: './packages/database/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/linkshortener',
  },
})
