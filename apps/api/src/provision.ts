import { sql } from 'drizzle-orm'
import { appSettings, users, type Database } from '@sharry/database'
import type { RuntimeEnv } from '@sharry/shared'
import { writeAudit } from './audit.ts'
import { hashPassword } from './passwords.ts'
import { countAdmins, readInitialized, seedSettings } from './settings-store.ts'

export type ProvisionLogger = {
  info: (message: string) => void
  error: (message: string) => void
}

export async function provisionAdmin(
  db: Database,
  env: RuntimeEnv,
  logger: ProvisionLogger = { info() {}, error() {} },
): Promise<{ created: boolean }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(481516234)`)
    if (await readInitialized(tx as unknown as Database)) return { created: false }
    const admins = await countAdmins(tx as unknown as Database)
    if (admins > 0) {
      await seedSettings(tx as unknown as Database, env, null)
      await markInitialized(tx as unknown as Database, null)
      return { created: false }
    }
    if (!env.INITIAL_ADMIN_USERNAME || !env.INITIAL_ADMIN_EMAIL || !env.INITIAL_ADMIN_PASSWORD) {
      throw new Error('Initial administrator credentials are required to set up Sharry.')
    }
    const passwordHash = await hashPassword(env.INITIAL_ADMIN_PASSWORD)
    const [admin] = await tx
      .insert(users)
      .values({
        username: env.INITIAL_ADMIN_USERNAME,
        email: env.INITIAL_ADMIN_EMAIL.toLowerCase(),
        passwordHash,
        role: 'admin',
        mustChangePassword: true,
        emailVerifiedAt: new Date(),
      })
      .returning()
    if (!admin) throw new Error('Could not create the initial administrator.')
    await writeAudit(tx as unknown as Database, {
      actorUserId: admin.id,
      action: 'admin.provisioned',
      entityType: 'user',
      entityId: admin.id,
      metadata: { username: admin.username, email: admin.email },
    })
    await seedSettings(tx as unknown as Database, env, admin.id)
    await markInitialized(tx as unknown as Database, admin.id)
    logger.info('Initial administrator account is ready')
    return { created: true }
  })
}

export async function createAdditionalAdmin(
  db: Database,
  identity: { username: string; email: string; password: string },
): Promise<void> {
  const username = identity.username.trim()
  const email = identity.email.trim().toLowerCase()
  const existing = await db.execute<{ id: string }>(sql`
    select id from users
    where lower(username) = ${username.toLowerCase()} or lower(email) = ${email}
    limit 1
  `)
  const rows = 'rows' in existing ? existing.rows : []
  if (rows.length > 0) {
    throw new Error('That username or email already exists. Refusing to reset the password.')
  }
  const passwordHash = await hashPassword(identity.password)
  const [admin] = await db
    .insert(users)
    .values({
      username,
      email,
      passwordHash,
      role: 'admin',
      mustChangePassword: true,
      emailVerifiedAt: new Date(),
    })
    .returning()
  if (!admin) throw new Error('Could not create the administrator.')
  await writeAudit(db, {
    actorUserId: admin.id,
    action: 'admin.created',
    entityType: 'user',
    entityId: admin.id,
    metadata: { username: admin.username, email: admin.email },
  })
}

async function markInitialized(db: Database, actorId: string | null): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: 'initialized', value: 'true', updatedBy: actorId })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: 'true', updatedBy: actorId, updatedAt: new Date() },
    })
}
