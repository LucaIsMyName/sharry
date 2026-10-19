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
    APP_NAME: z.preprocess(
      (value) => (value === undefined || value === '' ? 'Sharry' : value),
      z.string().min(1),
    ),
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
  })
  .superRefine((value, ctx) => {
    const prefixError = validatePrefix(value.SHORT_URL_PREFIX)
    if (prefixError) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SHORT_URL_PREFIX'], message: prefixError })
    }
  })

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>

export const deployEnvSchema = z.object({
  DEPLOY_ENABLED: z.enum(['true', 'false']).default('false'),
  DEPLOY_HOST: z.string().regex(/^[A-Za-z0-9.-]+$/),
  DEPLOY_PORT: port(22),
  DEPLOY_USER: z.string().regex(/^[a-z_][a-z0-9_-]*[$]?$/),
  DEPLOY_SSH_KEY_PATH: z.string().regex(/^\//, 'SSH key path must be absolute'),
  DEPLOY_REMOTE_DIR: z
    .string()
    .regex(/^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/)
    .refine((value) => !value.split('/').includes('..'), 'Remote directory cannot contain parent segments'),
  DEPLOY_BUILD_COMMAND: z.literal('npm run build').default('npm run build'),
  DEPLOY_RESTART_SERVICE: z.string().regex(/^[a-zA-Z0-9._@-]+$/),
  DEPLOY_HEALTHCHECK_URL: z.string().url(),
  DEPLOY_KNOWN_HOSTS_PATH: z.preprocess(emptyToUndefined, z.string().regex(/^\//).optional()),
})

export type DeployEnv = z.infer<typeof deployEnvSchema>

export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('\n')
}

export function parseRuntimeEnv(input: Record<string, unknown>): RuntimeEnv {
  const parsed = runtimeEnvSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration\n${formatIssues(parsed.error)}`)
  }
  return parsed.data
}

export function parseDeployEnv(input: Record<string, unknown>): DeployEnv {
  const parsed = deployEnvSchema.safeParse(input)
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
    else if (key !== 'REDIS_URL') runtime[key] = value
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
