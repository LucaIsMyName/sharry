import fs from 'node:fs'
import { parseEnvFile } from '@sharry/shared'

export function loadEnvFile(file = process.env.SHARRY_ENV_FILE ?? '.env'): void {
  if (!fs.existsSync(file)) return
  const parsed = parseEnvFile(fs.readFileSync(file, 'utf8'))
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
}
