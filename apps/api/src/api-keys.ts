import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { apiKeys, users } from '@sharry/database'
import type { Actor } from './auth.ts'
import { getSettings } from './settings-store.ts'
import { AppError, hashToken } from './support.ts'

export function bearerToken(request: { headers: { authorization?: string | undefined } }): string | null {
  const header = request.headers.authorization
  if (typeof header !== 'string' || !/^Bearer\b/i.test(header)) return null
  return header.replace(/^Bearer\s*/i, '').trim()
}

export function isAccountPath(pathname: string): boolean {
  return pathname === '/api/auth' || pathname.startsWith('/api/auth/')
}

export async function actorFromApiKey(app: FastifyInstance, token: string): Promise<Actor> {
  if (!token) throw new AppError(401, 'API key is not valid')
  const tokenHash = hashToken(token, app.env.SESSION_SECRET)
  const found = await app.db
    .select({ key: apiKeys, user: users })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.tokenHash, tokenHash), isNull(apiKeys.revokedAt)))
    .limit(1)
  const row = found[0]
  if (!row || !row.user.isActive || row.user.mustChangePassword) throw new AppError(401, 'API key is not valid')
  const settings = await getSettings(app.db, app.env)
  if (settings.mfaRequired && !row.user.totpEnabled) throw new AppError(401, 'API key is not valid')
  const lastUsed = row.key.lastUsedAt?.getTime() ?? 0
  if (Date.now() - lastUsed >= 60_000) {
    await app.db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.key.id))
  }
  return {
    id: row.user.id,
    username: row.user.username,
    email: row.user.email,
    role: row.user.role === 'admin' ? 'admin' : 'user',
    isActive: row.user.isActive,
    totpEnabled: row.user.totpEnabled,
    mustChangePassword: row.user.mustChangePassword,
    scope: 'full',
  }
}
