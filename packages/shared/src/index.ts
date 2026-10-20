export * from './password.ts'
export * from './env.ts'
export * from './prefix.ts'
export * from './utm.ts'
export * from './qr.ts'
export * from './schemas.ts'

export function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator <= 0) continue
    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

export function isAllowedOrigin(origin: string, appUrl: string, shortUrlBase: string, nodeEnv: string): boolean {
  let allowed = false
  for (const value of [appUrl, shortUrlBase]) {
    try {
      if (new URL(value).origin === origin) allowed = true
    } catch {
      continue
    }
  }
  if (allowed) return true
  if (nodeEnv === 'production') return false
  try {
    const url = new URL(origin)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch {
    return false
  }
}
