import fs from 'node:fs'
import path from 'node:path'
import { parseEnvFile } from '@sharry/shared'

export function loadEnvFile(file = process.env.SHARRY_ENV_FILE ?? findEnvFile()): void {
  if (!fs.existsSync(file)) return
  const parsed = parseEnvFile(fs.readFileSync(file, 'utf8'))
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function findEnvFile(): string {
  let dir = process.cwd()
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = path.join(dir, '.env')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve('.env')
}
