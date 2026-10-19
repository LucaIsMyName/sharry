import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureLocalDatabase } from './dev-db.ts'

await ensureLocalDatabase()

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const concurrently = path.join(root, 'node_modules/concurrently/dist/bin/concurrently.js')
const child = spawn(
  process.execPath,
  [concurrently, '-n', 'api,web', '-c', 'blue,green', 'tsx watch apps/api/src/index.ts', 'npm run dev -w @sharry/web'],
  { stdio: 'inherit' },
)

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
