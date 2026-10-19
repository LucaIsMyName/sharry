import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseRuntimeEnv } from '@sharry/shared'
import { loadEnvFile } from './env-file.ts'

loadEnvFile()
const env = parseRuntimeEnv(process.env)
const url = new URL(env.DATABASE_URL)
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const output = process.argv[2] ?? path.resolve('backups', `sharry-${stamp}.dump`)
fs.mkdirSync(path.dirname(output), { recursive: true })

const child = spawn('pg_dump', ['-Fc', '-f', output], {
  env: {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
  },
  stdio: ['ignore', 'inherit', 'pipe'],
})

let stderr = ''
child.stderr.on('data', (chunk: Buffer) => {
  stderr += chunk.toString()
})

const code: number = await new Promise((resolve) => {
  child.on('close', (exitCode) => resolve(exitCode ?? 1))
})

if (code !== 0) {
  process.stderr.write(stderr)
  process.exit(code)
}
console.log(`Backup written to ${output}`)
