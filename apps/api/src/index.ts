import { sql } from 'drizzle-orm'
import { createDb, runMigrations, sessions } from '@sharry/database'
import { parseRuntimeEnv } from '@sharry/shared'
import { purgeOldClicks } from './analytics.ts'
import { loadEnvFile } from './load-env.ts'
import { provisionAdmin } from './provision.ts'
import { buildApp } from './server.ts'
import { getSettings } from './settings-store.ts'

loadEnvFile()

let env: ReturnType<typeof parseRuntimeEnv>
try {
  env = parseRuntimeEnv(process.env)
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid environment configuration')
  process.exit(1)
}

const { db, pool } = createDb(env.DATABASE_URL)

try {
  await runMigrations(db)
  await provisionAdmin(db, env, {
    info: (message) => console.log(message),
    error: (message) => console.error(message),
  })
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Sharry failed to start')
  await pool.end()
  process.exit(1)
}

const app = await buildApp({ env, db, pool })

const timer = setInterval(() => {
  void (async () => {
    const settings = await getSettings(db, env)
    await purgeOldClicks(db, settings.analyticsRetentionDays)
    await db.delete(sessions).where(sql`${sessions.expiresAt} < now()`)
  })().catch((error: unknown) => {
    app.log.error({ err: error }, 'Retention purge failed')
  })
}, 60 * 60 * 1000)
timer.unref()

let closing = false
const close = async () => {
  if (closing) return
  closing = true
  clearInterval(timer)
  await app.close()
  await pool.end()
}

process.on('SIGINT', () => {
  void close().then(() => process.exit(0))
})
process.on('SIGTERM', () => {
  void close().then(() => process.exit(0))
})

await app.listen({ host: env.APP_HOST, port: env.APP_PORT })
