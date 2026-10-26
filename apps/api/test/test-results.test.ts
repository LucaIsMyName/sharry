import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp, shippedTestResults } from '../src/server.ts'
import { getContext, useTestApp } from './helpers.ts'

const shipped = '# ran_at=2026-10-26T00:00:00.000Z\nfile,passed,failed,skipped,duration_ms\n"a.test.ts",1,0,0,2\n'

describe('shipped test results', () => {
  useTestApp()

  it('reads a csv from a dashboard build and ignores a tree without one', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sharry-suite-results-'))
    expect(shippedTestResults(root)).toBeNull()
    const file = path.join(root, 'apps/web/dist/test-results.csv')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, shipped)
    expect(shippedTestResults(root)).toBe(shipped)
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('serves the csv from the production build and hides it otherwise', async () => {
    const ctx = await getContext()
    const hidden = await ctx.app.inject({ method: 'GET', url: '/test-results.csv' })
    expect(hidden.statusCode).toBe(404)

    const file = path.resolve('apps/web/dist/test-results.csv')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const previous = fs.existsSync(file) ? fs.readFileSync(file) : null
    fs.writeFileSync(file, shipped)
    const app = await buildApp({
      env: { ...ctx.env, NODE_ENV: 'production' },
      db: ctx.db,
      pool: ctx.pool,
      logger: false,
    })
    try {
      const response = await app.inject({ method: 'GET', url: '/test-results.csv' })
      expect(response.statusCode).toBe(200)
      expect(String(response.headers['content-type'])).toContain('text/csv')
      expect(response.body).toBe(shipped)
    } finally {
      await app.close()
      if (previous) fs.writeFileSync(file, previous)
      else fs.rmSync(file, { force: true })
    }
  })
})
