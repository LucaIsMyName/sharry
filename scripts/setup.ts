import { createDb, runMigrations } from '@sharry/database'
import { parseRuntimeEnv } from '@sharry/shared'
import { provisionAdmin } from '../apps/api/src/provision.ts'
import { ensureLocalDatabase, stopLocalDatabase } from './dev-db.ts'
import { loadEnvFile } from './env-file.ts'

loadEnvFile()
await ensureLocalDatabase()
const env = parseRuntimeEnv(process.env)
const { db, pool } = createDb(env.DATABASE_URL)
try {
  await runMigrations(db)
  const result = await provisionAdmin(db, env, {
    info: (message) => console.log(message),
    error: (message) => console.error(message),
  })
  console.log(result.created ? 'Initial administrator created' : 'Setup already completed')
  console.log('Sign in and change the initial password.')
} finally {
  await pool.end()
  await stopLocalDatabase()
}
