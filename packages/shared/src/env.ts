import { z } from 'zod'
import { validatePrefix } from './prefix.ts'

const emptyToUndefined = (value: unknown) => {
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}

const port = (fallback: number) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? fallback : value),
    z.coerce.number().int().positive(),
  )

export const runtimeEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.preprocess((value) => {
      if (value === undefined || value === null) return 'Sharry'
      if (typeof value !== 'string') return value
      const trimmed = value.trim()
      return trimmed === '' ? 'Sharry' : trimmed
    }, z.string().min(1)),
    APP_URL: z.string().url(),
    APP_HOST: z.preprocess(
      (value) => (value === undefined || value === '' ? '0.0.0.0' : value),
      z.string().min(1),
    ),
    APP_PORT: port(3000),
    SHORT_URL_BASE: z.string().url(),
    SHORT_URL_PREFIX: z.string().min(2),
    DATABASE_URL: z.string().min(1),
    INITIAL_ADMIN_USERNAME: z.preprocess(emptyToUndefined, z.string().min(3).max(32).optional()),
    INITIAL_ADMIN_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
    INITIAL_ADMIN_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(12).max(200).optional()),
    SESSION_SECRET: z.string().min(32),
    ENCRYPTION_KEY: z.string().min(32),
    OTP_ISSUER: z.preprocess(
      (value) => (value === undefined || value === '' ? 'Sharry' : value),
      z.string().min(1),
    ),
    SMTP_HOST: z.string().default(''),
    SMTP_PORT: port(587),
    SMTP_USER: z.string().default(''),
    SMTP_PASSWORD: z.string().default(''),
    EMAIL_FROM: z.string().default(''),
    GEOIP_DB_PATH: z.string().default(''),
    QR_DATA_DIR: z.preprocess(
      (value) => (value === undefined || value === '' ? 'data/qr-logos' : value),
      z.string().min(1),
    ),
    AVATAR_DATA_DIR: z.preprocess(
      (value) => (value === undefined || value === '' ? 'data/avatars' : value),
      z.string().min(1),
    ),
  })
  .superRefine((value, ctx) => {
    const prefixError = validatePrefix(value.SHORT_URL_PREFIX)
    if (prefixError) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SHORT_URL_PREFIX'], message: prefixError })
    }
  })

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>

const absoluteDir = z
  .string()
  .regex(/^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/)
  .refine((value) => !value.split('/').includes('..'), 'Remote directory cannot contain parent segments')

export const deployEnvSchema = z.object({
  DEPLOY_ENABLED: z.enum(['true', 'false']).default('false'),
  DEPLOY_HOST: z.string().regex(/^[A-Za-z0-9.-]+$/),
  DEPLOY_PORT: port(22),
  DEPLOY_USER: z.string().regex(/^[a-z_][a-z0-9_-]*[$]?$/),
  DEPLOY_SSH_KEY_PATH: z.string().regex(/^\//, 'SSH key path must be absolute'),
  DEPLOY_REMOTE_DIR: z.preprocess(
    (value) => (value === undefined || value === '' ? '/var/www/sharry' : value),
    absoluteDir,
  ),
  DEPLOY_BUILD_COMMAND: z.literal('npm run build').default('npm run build'),
  DEPLOY_RESTART_SERVICE: z.preprocess(
    (value) => (value === undefined || value === '' ? 'sharry' : value),
    z.string().regex(/^[a-zA-Z0-9._@-]+$/),
  ),
  DEPLOY_HEALTHCHECK_URL: z.string().url(),
  DEPLOY_KNOWN_HOSTS_PATH: z.preprocess(emptyToUndefined, z.string().regex(/^\//).optional()),
})

export type DeployEnv = z.infer<typeof deployEnvSchema>

export function chooseEnvFile(
  purpose: 'development' | 'production',
  present: { override?: string | undefined; development?: boolean; legacy?: boolean } = {},
): string {
  const override = present.override?.trim()
  if (override) return override
  if (purpose === 'production') return '.env.production'
  if (present.development || !present.legacy) return '.env.development'
  return '.env'
}

export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('\n')
}

const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i

function blank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}

export function applyPublicUrls(input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input }
  const raw = next.DOMAIN
  if (typeof raw !== 'string' || raw.trim() === '') return next
  const domain = raw.trim().toLowerCase()
  if (!domainPattern.test(domain)) {
    throw new Error('DOMAIN must be a hostname such as share.example.com, without a scheme or path.')
  }
  next.DOMAIN = domain
  const origin = `https://${domain}`
  if (blank(next.APP_URL)) next.APP_URL = origin
  if (blank(next.SHORT_URL_BASE)) next.SHORT_URL_BASE = origin
  if (blank(next.DEPLOY_HEALTHCHECK_URL)) next.DEPLOY_HEALTHCHECK_URL = `${origin}/health`
  return next
}

export function parseRuntimeEnv(input: Record<string, unknown>): RuntimeEnv {
  const parsed = runtimeEnvSchema.safeParse(applyPublicUrls(input))
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration\n${formatIssues(parsed.error)}`)
  }
  return parsed.data
}

export function parseDeployEnv(input: Record<string, unknown>): DeployEnv {
  const parsed = deployEnvSchema.safeParse(applyPublicUrls(input))
  if (!parsed.success) {
    throw new Error(`Invalid deployment configuration\n${formatIssues(parsed.error)}`)
  }
  return parsed.data
}

export function splitEnv(vars: Record<string, string>): {
  runtime: Record<string, string>
  deploy: Record<string, string>
} {
  const runtime: Record<string, string> = {}
  const deploy: Record<string, string> = {}
  for (const [key, value] of Object.entries(vars)) {
    if (key.startsWith('DEPLOY_')) deploy[key] = value
    else if (key !== 'REDIS_URL' && key !== 'DOMAIN') runtime[key] = value
  }
  return { runtime, deploy }
}

export function serializeEnv(vars: Record<string, string>): string {
  return `${Object.entries(vars)
    .map(([key, value]) => `${key}=${quoteEnv(value)}`)
    .join('\n')}\n`
}

function quoteEnv(value: string): string {
  if (value === '') return ''
  if (/[\s#"'$\\`]/.test(value)) return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  return value
}

export function redactSecrets(text: string, secrets: string[]): string {
  const unique = [...new Set(secrets.filter((secret) => secret.length >= 8))]
  unique.sort((a, b) => b.length - a.length)
  let output = text
  for (const secret of unique) output = output.split(secret).join('[redacted]')
  return output
}
