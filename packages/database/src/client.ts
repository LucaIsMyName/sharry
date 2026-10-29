import fs from 'node:fs'
import path from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import * as schema from './schema.ts'

export function poolConfig(databaseUrl: string): pg.PoolConfig {
  const config: pg.PoolConfig = { connectionString: databaseUrl, max: 10 }
  const host = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (!loopback && !new URL(databaseUrl).searchParams.has('sslmode')) config.ssl = { rejectUnauthorized: true }
  return config
}

export function createDb(databaseUrl: string) {
  const pool = new pg.Pool(poolConfig(databaseUrl))
  const db = drizzle(pool, { schema })
  return { db, pool }
}

export type Database = ReturnType<typeof createDb>['db']

export function migrationsFolder(): string {
  let dir = process.cwd()
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = path.join(dir, 'packages/database/drizzle')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve('packages/database/drizzle')
}

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() })
}
