import { createDb, runMigrations } from '@sharry/database'
import { parseRuntimeEnv } from '@sharry/shared'
import { ensureLocalDatabase, stopLocalDatabase } from './dev-db.ts'
import { loadEnvFile } from './env-file.ts'

loadEnvFile()
await ensureLocalDatabase()
const env = parseRuntimeEnv(process.env)
const { db, pool } = createDb(env.DATABASE_URL)
try {
  await runMigrations(db)
  console.log('Migrations applied')
} finally {
  await pool.end()
  await stopLocalDatabase()
}
