import { createDb, runMigrations } from '@sharry/database'
import { parseRuntimeEnv } from '@sharry/shared'
import { createAdditionalAdmin } from '../apps/api/src/provision.ts'
import { loadEnvFile } from './env-file.ts'

loadEnvFile()
const env = parseRuntimeEnv(process.env)
if (!env.INITIAL_ADMIN_USERNAME || !env.INITIAL_ADMIN_EMAIL || !env.INITIAL_ADMIN_PASSWORD) {
  console.error('Set INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_EMAIL, and INITIAL_ADMIN_PASSWORD before creating an administrator.')
  process.exit(1)
}
const { db, pool } = createDb(env.DATABASE_URL)
try {
  await runMigrations(db)
  await createAdditionalAdmin(db, {
    username: env.INITIAL_ADMIN_USERNAME,
    email: env.INITIAL_ADMIN_EMAIL,
    password: env.INITIAL_ADMIN_PASSWORD,
  })
  console.log('Administrator created. They must change the password and enroll two-factor authentication at first sign-in.')
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not create the administrator')
  process.exitCode = 1
} finally {
  await pool.end()
}
