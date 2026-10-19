import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureLocalDatabase, stopLocalDatabase } from './dev-db.ts'

await ensureLocalDatabase()

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const concurrently = path.join(root, 'node_modules/concurrently/dist/bin/concurrently.js')
const child = spawn(
  process.execPath,
  [concurrently, '-n', 'api,web', '-c', 'blue,green', 'tsx watch apps/api/src/index.ts', 'npm run dev -w @sharry/web'],
  { stdio: 'inherit' },
)

let shuttingDown = false

async function shutdown(code: number): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  try {
    await stopLocalDatabase()
  } finally {
    process.exit(code)
  }
}

child.on('exit', (code) => {
  void shutdown(code ?? 0)
})

function stopChild(signal: NodeJS.Signals) {
  child.kill(signal)
  setTimeout(() => {
    void shutdown(1)
  }, 5000).unref()
}

process.on('SIGINT', () => stopChild('SIGINT'))
process.on('SIGTERM', () => stopChild('SIGTERM'))
