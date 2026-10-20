import crypto from 'node:crypto'

export function ensureLocalSecrets(vars: Record<string, string | undefined>): Record<string, string> {
  const updates: Record<string, string> = {}
  if (!vars.SESSION_SECRET?.trim()) updates.SESSION_SECRET = crypto.randomBytes(32).toString('base64url')
  if (!vars.ENCRYPTION_KEY?.trim()) updates.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64url')
  return updates
}

export function generatedDatabaseUrl(): string {
  const password = crypto.randomBytes(24).toString('base64url')
  return `postgresql://sharry:${password}@127.0.0.1:5432/sharry`
}
