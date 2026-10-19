import fs from 'node:fs'
import path from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import type { TestProject } from 'vitest/node'

let embedded: EmbeddedPostgres | null = null

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const port = 54329
  const databaseDir = path.resolve('data/pg-test')
  fs.mkdirSync(path.dirname(databaseDir), { recursive: true })
  embedded = new EmbeddedPostgres({
    databaseDir,
    user: 'sharry',
    password: 'sharry',
    port,
    persistent: true,
  })
  try {
    await embedded.initialise()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/already|exists|init/i.test(message)) throw error
  }
  await embedded.start()
  try {
    await embedded.createDatabase('sharry_test')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/already exists/i.test(message)) throw error
  }
  const databaseUrl = `postgresql://sharry:sharry@127.0.0.1:${port}/sharry_test`
  const pool = new pg.Pool({ connectionString: databaseUrl })
  const db = drizzle(pool)
  await migrate(db, { migrationsFolder: path.resolve('packages/database/drizzle') })
  await pool.end()
  project.provide('databaseUrl', databaseUrl)
  return async () => {
    await embedded?.stop()
  }
}
