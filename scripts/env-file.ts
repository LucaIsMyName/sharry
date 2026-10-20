import fs from 'node:fs'
import { chooseEnvFile, parseEnvFile, serializeEnv } from '@sharry/shared'

export function resolveEnvFile(purpose: 'development' | 'production' = 'development'): string {
  return chooseEnvFile(purpose, {
    override: process.env.SHARRY_ENV_FILE,
    development: fs.existsSync('.env.development'),
    legacy: fs.existsSync('.env'),
  })
}

export function loadEnvFile(file = resolveEnvFile('development')): void {
  if (!fs.existsSync(file)) return
  const parsed = parseEnvFile(fs.readFileSync(file, 'utf8'))
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
}

export function upsertEnvKeys(file: string, updates: Record<string, string>): void {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  let next = current
  if (next.length > 0 && !next.endsWith('\n')) next += '\n'
  for (const [key, value] of Object.entries(updates)) {
    if (!/^[A-Z0-9_]+$/.test(key)) throw new Error(`Unsupported environment key ${key}`)
    const line = serializeEnv({ [key]: value }).trimEnd()
    const pattern = new RegExp(`^${key}=.*$`, 'm')
    if (pattern.test(next)) next = next.replace(pattern, line)
    else next += `${line}\n`
  }
  fs.writeFileSync(file, next, { mode: 0o600 })
}
