import { eq, sql } from 'drizzle-orm'
import { appSettings, type Database } from '@sharry/database'
import {
  defaultQrStyle,
  qrStyleSchema,
  validatePrefix,
  type QrStyle,
  type RuntimeEnv,
} from '@sharry/shared'

export type RedirectType = '301' | '302' | '307' | '308'

export type AppSettings = {
  initialized: boolean
  shortUrlPrefix: string
  legacyPrefixEnabled: boolean
  legacyPrefixes: string[]
  appUrl: string
  shortUrlBase: string
  defaultRedirectType: RedirectType
  slugLength: number
  analyticsRetentionDays: number
  registrationPolicy: 'closed'
  sessionTtlHours: number
  defaultQrStyle: QrStyle
  mfaRequired: boolean
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPasswordEncrypted: string
  emailFrom: string
}

let cached: AppSettings | null = null

export function invalidateSettings(): void {
  cached = null
}

export function defaultSettings(env: RuntimeEnv): AppSettings {
  return {
    initialized: false,
    shortUrlPrefix: env.SHORT_URL_PREFIX,
    legacyPrefixEnabled: false,
    legacyPrefixes: [],
    appUrl: trimSlash(env.APP_URL),
    shortUrlBase: trimSlash(env.SHORT_URL_BASE),
    defaultRedirectType: '302',
    slugLength: 5,
    analyticsRetentionDays: 365,
    registrationPolicy: 'closed',
    sessionTtlHours: 168,
    defaultQrStyle,
    mfaRequired: false,
    smtpHost: '',
    smtpPort: env.SMTP_PORT,
    smtpUser: '',
    smtpPasswordEncrypted: '',
    emailFrom: '',
  }
}

export function settingsToRows(settings: AppSettings): Record<string, string> {
  return {
    initialized: settings.initialized ? 'true' : 'false',
    short_url_prefix: settings.shortUrlPrefix,
    legacy_prefix_enabled: settings.legacyPrefixEnabled ? 'true' : 'false',
    legacy_prefixes: JSON.stringify(settings.legacyPrefixes),
    app_url: settings.appUrl,
    short_url_base: settings.shortUrlBase,
    default_redirect_type: settings.defaultRedirectType,
    slug_length: String(settings.slugLength),
    analytics_retention_days: String(settings.analyticsRetentionDays),
    registration_policy: settings.registrationPolicy,
    session_ttl_hours: String(settings.sessionTtlHours),
    default_qr_style: JSON.stringify(settings.defaultQrStyle),
    mfa_required: settings.mfaRequired ? 'true' : 'false',
    smtp_host: settings.smtpHost,
    smtp_port: String(settings.smtpPort),
    smtp_user: settings.smtpUser,
    smtp_password: settings.smtpPasswordEncrypted,
    email_from: settings.emailFrom,
  }
}

export async function getSettings(db: Database, env: RuntimeEnv): Promise<AppSettings> {
  if (cached) return cached
  const rows = await db.select().from(appSettings)
  const map: Record<string, string> = {}
  for (const row of rows) map[row.key] = row.value
  cached = parseSettings(map, env)
  return cached
}

export function parseSettings(map: Record<string, string | undefined>, env: RuntimeEnv): AppSettings {
  const defaults = defaultSettings(env)
  const prefix = map.short_url_prefix ?? defaults.shortUrlPrefix
  return {
    initialized: map.initialized === 'true',
    shortUrlPrefix: validatePrefix(prefix) ? defaults.shortUrlPrefix : prefix,
    legacyPrefixEnabled: map.legacy_prefix_enabled === 'true',
    legacyPrefixes: parseStringArray(map.legacy_prefixes).filter((prefix) => validatePrefix(prefix) === null),
    appUrl: map.app_url || defaults.appUrl,
    shortUrlBase: map.short_url_base || defaults.shortUrlBase,
    defaultRedirectType: isRedirect(map.default_redirect_type) ? map.default_redirect_type : defaults.defaultRedirectType,
    slugLength: clamp(Number(map.slug_length ?? defaults.slugLength), 4, 16),
    analyticsRetentionDays: clamp(Number(map.analytics_retention_days ?? defaults.analyticsRetentionDays), 0, 3650),
    registrationPolicy: 'closed',
    sessionTtlHours: clamp(Number(map.session_ttl_hours ?? defaults.sessionTtlHours), 1, 24 * 90),
    defaultQrStyle: parseQrStyle(map.default_qr_style) ?? defaults.defaultQrStyle,
    mfaRequired: map.mfa_required === 'true',
    smtpHost: map.smtp_host ?? '',
    smtpPort: clamp(Number(map.smtp_port ?? defaults.smtpPort), 1, 65535),
    smtpUser: map.smtp_user ?? '',
    smtpPasswordEncrypted: map.smtp_password ?? '',
    emailFrom: map.email_from ?? '',
  }
}

export async function seedSettings(
  db: Pick<Database, 'insert'>,
  env: RuntimeEnv,
  actorId: string | null,
  overrides: Record<string, string> = {},
): Promise<void> {
  const rows = { ...settingsToRows(defaultSettings(env)), ...overrides }
  for (const [key, value] of Object.entries(rows)) {
    await db
      .insert(appSettings)
      .values({ key, value, updatedBy: actorId })
      .onConflictDoNothing()
  }
}

export async function writeSetting(
  db: Database,
  key: string,
  value: string,
  actorId: string | null,
): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedBy: actorId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedBy: actorId, updatedAt: new Date() },
    })
  invalidateSettings()
}

export async function readInitialized(db: Database): Promise<boolean> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, 'initialized')).limit(1)
  return rows[0]?.value === 'true'
}

export async function countAdmins(db: Database): Promise<number> {
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from users where role = 'admin'`,
  )
  return rowsOf<{ count: number }>(result)[0]?.count ?? 0
}

export function rowsOf<T>(result: unknown): T[] {
  if (typeof result === 'object' && result !== null && 'rows' in result && Array.isArray(result.rows)) {
    return result.rows as T[]
  }
  return []
}

function parseStringArray(value: string | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function parseQrStyle(value: string | undefined): QrStyle | null {
  if (!value) return null
  try {
    const parsed = qrStyleSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function isRedirect(value: string | undefined): value is RedirectType {
  return value === '301' || value === '302' || value === '307' || value === '308'
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function trimSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
