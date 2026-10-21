import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSessionUser, getContext, useTestApp } from './helpers.ts'
import { memoryFromProc } from '../src/system.ts'

const installed = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
  name: string
  version: string
}

describe('server snapshot', () => {
  useTestApp()

  it('reads host memory from Linux meminfo and ignores cache-only lines', () => {
    const parsed = memoryFromProc('MemTotal:       8000000 kB\nMemFree:         1000000 kB\nMemAvailable:    5000000 kB\n')
    expect(parsed).toEqual({ totalBytes: 8000000 * 1024, availableBytes: 5000000 * 1024 })
    expect(memoryFromProc('MemTotal: 100 kB\nMemFree: 10 kB\n')).toBeNull()
    expect(memoryFromProc('MemTotal: 100 kB\nMemAvailable: 400 kB\n')).toEqual({ totalBytes: 100 * 1024, availableBytes: 100 * 1024 })
  })

  it('hides the snapshot from signed-out visitors and standard users', async () => {
    const ctx = await getContext()
    const missing = await ctx.app.inject({ method: 'GET', url: '/api/admin/system' })
    expect(missing.statusCode).toBe(401)

    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const hidden = await ctx.app.inject({ method: 'GET', url: '/api/admin/system', headers: { cookie: user.cookie } })
    expect(hidden.statusCode).toBe(404)
  })

  it('returns memory, disk, and the installed runtime to an administrator', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const response = await ctx.app.inject({ method: 'GET', url: '/api/admin/system', headers: { cookie: admin.cookie } })
    expect(response.statusCode).toBe(200)
    const body = response.json()

    expect(body.memory.totalBytes).toBeGreaterThan(0)
    expect(body.memory.usedBytes + body.memory.availableBytes).toBe(body.memory.totalBytes)
    expect(body.memory.processRssBytes).toBeGreaterThan(0)

    expect(body.storage.totalBytes).toBeGreaterThan(0)
    expect(body.storage.usedBytes).toBeGreaterThanOrEqual(0)
    expect(body.storage.availableBytes).toBeGreaterThanOrEqual(0)
    expect(body.storage.usedBytes + body.storage.availableBytes).toBeLessThanOrEqual(body.storage.totalBytes)
    expect(body.storage.databaseBytes).toBeGreaterThan(0)

    expect(body.os.platform).toBeTruthy()
    expect(body.os.type).toBeTruthy()
    expect(body.os.release).toBeTruthy()
    expect(body.os.arch).toBeTruthy()
    expect(body.os.hostname).toBeTruthy()
    expect(body.cpu.cores).toBeGreaterThan(0)
    expect(body.cpu.loadAverage).toHaveLength(3)
    expect(body.uptime.systemSeconds).toBeGreaterThan(0)
    expect(body.uptime.processSeconds).toBeGreaterThanOrEqual(0)
    expect(body.runtime).toMatchObject({
      packageName: installed.name,
      packageVersion: installed.version,
      nodeVersion: process.version,
    })
    expect(body.runtime.postgresVersion).toMatch(/PostgreSQL/)
    expect(Number.isNaN(Date.parse(body.collectedAt))).toBe(false)
  })
})
