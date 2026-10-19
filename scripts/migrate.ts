import { createDb, runMigrations } from '@sharry/database'
import { parseRuntimeEnv } from '@sharry/shared'
import { loadEnvFile } from './env-file.ts'

loadEnvFile()
const env = parseRuntimeEnv(process.env)
const { db, pool } = createDb(env.DATABASE_URL)
try {
  await runMigrations(db)
  console.log('Migrations applied')
} finally {
  await pool.end()
}
