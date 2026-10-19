import net from 'node:net'
import EmbeddedPostgres from 'embedded-postgres'
import { loadEnvFile } from './env-file.ts'

let embedded: EmbeddedPostgres | null = null

export async function stopLocalDatabase(): Promise<void> {
  if (!embedded) return
  const current = embedded
  embedded = null
  await current.stop()
}

export async function ensureLocalDatabase(): Promise<void> {
  loadEnvFile()
  if (process.env.NODE_ENV === 'production') return
  const target = localDatabaseTarget(process.env.DATABASE_URL)
  if (!target) return
  if (await canConnect(target.host, target.port)) return
  const databaseDir = 'data/pg-dev'
  embedded = new EmbeddedPostgres({
    databaseDir,
    user: target.user,
    password: target.password,
    port: target.port,
    persistent: true,
    onLog: () => {},
    onError: (message) => console.error(message),
  })
  try {
    await embedded.initialise()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/already|exists|init/i.test(message)) throw error
  }
  await embedded.start()
  try {
    await embedded.createDatabase(target.database)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/already exists/i.test(message)) throw error
  }
  console.log(`Local Postgres is listening on ${target.host}:${target.port}`)
}

function localDatabaseTarget(databaseUrl: string | undefined): { host: string; port: number; user: string; password: string; database: string } | null {
  if (!databaseUrl) return null
  let url: URL
  try {
    url = new URL(databaseUrl)
  } catch {
    return null
  }
  const host = url.hostname
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') return null
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!database || !url.username) return null
  return {
    host: host === 'localhost' ? '127.0.0.1' : host,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  }
}

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    let settled = false
    const finish = (open: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(500, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}
