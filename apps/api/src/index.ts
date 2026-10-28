import { sql } from 'drizzle-orm'
import { createDb, runMigrations, sessions } from '@sharry/database'
import { parseRuntimeEnv } from '@sharry/shared'
import { purgeOldClicks } from './analytics.ts'
import { purgeOldAiUsage } from './ai/usage.ts'
import { purgeExpiredResetTokens } from './auth.ts'
import { recheckVerifiedDomains } from './redirect-domains.ts'
import { purgeLinkPasswordAttempts } from './redirect.ts'
import { loadEnvFile } from './load-env.ts'
import { moveQrLogosToMedia } from './media-backfill.ts'
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
  const moved = await moveQrLogosToMedia(db, env)
  if (moved > 0) console.log(`Moved ${moved} QR center images into the media library`)
} catch (error) {
  console.error(startupMessage(error))
  await pool.end()
  process.exit(1)
}

function startupMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Sharry failed to start'
  const cause = error.cause instanceof Error ? error.cause.message : ''
  return cause && !error.message.includes(cause) ? `${error.message}\n${cause}` : error.message
}

let app: Awaited<ReturnType<typeof buildApp>>
try {
  app = await buildApp({ env, db, pool })
} catch (error) {
  console.error(startupMessage(error))
  await pool.end()
  process.exit(1)
}

async function runRetention(): Promise<void> {
  const settings = await getSettings(db, env)
  await purgeOldClicks(db, settings.analyticsRetentionDays)
  await purgeOldAiUsage(db, settings.analyticsRetentionDays)
  await purgeExpiredResetTokens(db)
  await db.delete(sessions).where(sql`${sessions.expiresAt} < now()`)
  await purgeLinkPasswordAttempts(db)
  await recheckVerifiedDomains(db, env.APP_NAME)
}

try {
  await runRetention()
} catch (error) {
  app.log.error({ err: error }, 'Retention purge failed')
}

const timer = setInterval(() => {
  void runRetention().catch((error: unknown) => {
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

try {
  await app.listen({ host: env.APP_HOST, port: env.APP_PORT })
} catch (error) {
  console.error(startupMessage(error))
  await close()
  process.exit(1)
}
