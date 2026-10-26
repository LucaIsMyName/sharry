import crypto from 'node:crypto'
import { ZodError, type ZodType } from 'zod'

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = 'error',
  ) {
    super(message)
  }
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new AppError(400, issues(result.error), 'validation')
  }
  return result.data
}

function issues(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join(' ')
}

export function isUniqueViolation(error: unknown): boolean {
  return errorChain(error).some((item) => item.code === '23505')
}

export function uniqueConstraint(error: unknown): string | null {
  for (const item of errorChain(error)) {
    if (item.code === '23505') return item.constraint ?? 'unique'
  }
  return null
}

function errorChain(error: unknown): { code?: string; constraint?: string }[] {
  const chain: { code?: string; constraint?: string }[] = []
  let current: unknown = error
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current === 'object' && current !== null) {
      const record = current as { code?: unknown; constraint?: unknown; cause?: unknown }
      chain.push({
        code: typeof record.code === 'string' ? record.code : undefined,
        constraint: typeof record.constraint === 'string' ? record.constraint : undefined,
      })
      current = record.cause
    } else break
  }
  return chain
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

export function hashToken(token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(token).digest('hex')
}

export function encryptString(plaintext: string, keyMaterial: string): string {
  const key = crypto.createHash('sha256').update(keyMaterial).digest()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export function decryptString(payload: string, keyMaterial: string): string {
  const buffer = Buffer.from(payload, 'base64url')
  const iv = buffer.subarray(0, 12)
  const tag = buffer.subarray(12, 28)
  const encrypted = buffer.subarray(28)
  const key = crypto.createHash('sha256').update(keyMaterial).digest()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export function anonymousVisitorId(ip: string, userAgent: string, secret: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10)
  return crypto.createHmac('sha256', secret).update(`${day}|${truncateIp(ip)}|${userAgent}`).digest('hex')
}

export function linkPasswordNetworkId(ip: string, secret: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10)
  return crypto.createHmac('sha256', secret).update(`link-password|${day}|${truncateIp(ip)}`).digest('hex')
}

export function truncateIp(ip: string): string {
  if (ip.includes('.')) {
    const parts = ip.split('.')
    if (parts.length === 4) {
      parts[3] = '0'
      return parts.join('.')
    }
  }
  const parts = ip.split(':').filter(Boolean)
  return `${parts.slice(0, 3).join(':')}::`
}

const BOT_PATTERN =
  /bot|spider|crawl|slurp|mediapartners|facebookexternalhit|preview|wget|curl|python-requests|go-http-client|headless|monitor/i

export function parseUserAgent(userAgent: string | undefined): {
  browser: string
  operatingSystem: string
  deviceType: string
  isBot: boolean
} {
  const value = userAgent ?? ''
  const isBot = value.length === 0 || BOT_PATTERN.test(value)
  let browser = 'Other'
  if (/edg\//i.test(value)) browser = 'Edge'
  else if (/chrome|crios/i.test(value)) browser = 'Chrome'
  else if (/firefox|fxios/i.test(value)) browser = 'Firefox'
  else if (/safari/i.test(value)) browser = 'Safari'
  else if (/opera|opr\//i.test(value)) browser = 'Opera'

  let operatingSystem = 'Other'
  if (/windows/i.test(value)) operatingSystem = 'Windows'
  else if (/android/i.test(value)) operatingSystem = 'Android'
  else if (/iphone|ipad|ios/i.test(value)) operatingSystem = 'iOS'
  else if (/mac os/i.test(value)) operatingSystem = 'macOS'
  else if (/linux/i.test(value)) operatingSystem = 'Linux'

  let deviceType = 'desktop'
  if (/ipad|tablet/i.test(value)) deviceType = 'tablet'
  else if (/mobile|iphone|android/i.test(value)) deviceType = 'mobile'
  if (isBot) deviceType = 'bot'
  return { browser, operatingSystem, deviceType, isBot }
}

export function referrerHost(referrer: string | undefined): string | null {
  if (!referrer) return null
  try {
    return new URL(referrer).hostname.slice(0, 200)
  } catch {
    return null
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return map[character] ?? character
  })
}

export function csv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}
