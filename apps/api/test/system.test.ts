import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSessionUser, getContext, useTestApp } from './helpers.ts'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { memoryFromProc, measureApp, nodeStoragePaths, storageParts } from '../src/system.ts'

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
    expect(body.storage.parts.map((part: { id: string }) => part.id)).toEqual([
      'operatingSystem',
      'node',
      'code',
      'packages',
      'media',
      'database',
    ])
    const named = body.storage.parts
      .filter((part: { id: string }) => part.id !== 'operatingSystem')
      .reduce((sum: number, part: { bytes: number }) => sum + part.bytes, 0)
    const operatingSystem = body.storage.parts.find((part: { id: string }) => part.id === 'operatingSystem').bytes
    expect(operatingSystem).toBe(Math.max(0, body.storage.usedBytes - named))
    expect(body.storage.parts.find((part: { id: string }) => part.id === 'database').bytes).toBe(body.storage.databaseBytes)

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

describe('storage parts', () => {
  it('gives the rest of the disk to the operating system and never goes below zero', () => {
    expect(
      storageParts({
        usedBytes: 100,
        nodeBytes: 10,
        codeBytes: 20,
        packageBytes: 30,
        mediaBytes: 5,
        databaseBytes: 15,
      }),
    ).toEqual([
      { id: 'operatingSystem', bytes: 20 },
      { id: 'node', bytes: 10 },
      { id: 'code', bytes: 20 },
      { id: 'packages', bytes: 30 },
      { id: 'media', bytes: 5 },
      { id: 'database', bytes: 15 },
    ])
    expect(storageParts({ usedBytes: 10, nodeBytes: 0, codeBytes: 0, packageBytes: 0, mediaBytes: 0, databaseBytes: 50 })[0]).toEqual({
      id: 'operatingSystem',
      bytes: 0,
    })
  })

  it('treats a versioned Node install as one directory and a system Node as the binary', () => {
    const version = nodeStoragePaths('/Users/ada/.nvm/versions/node/v22.23.4/bin/node')
    expect(version).toEqual([path.normalize('/Users/ada/.nvm/versions/node/v22.23.4')])
    const system = nodeStoragePaths('/usr/bin/node')
    expect(system[0]).toBe(path.normalize('/usr/bin/node'))
    expect(system[1]).toBe(path.normalize('/usr/lib/node_modules/npm'))
  })

  it('counts source as code, node_modules as packages, and leaves media out of both', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sharry-disk-'))
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'src', 'app.txt'), 'code')
    await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), 'package')
    await mkdir(path.join(root, 'data', 'media'), { recursive: true })
    await writeFile(path.join(root, 'data', 'media', 'photo.bin'), 'media-file')
    const measured = await measureApp(root, [path.join(root, 'data', 'media')])
    expect(measured.codeBytes).toBe(Buffer.byteLength('code'))
    expect(measured.packageBytes).toBeGreaterThanOrEqual(Buffer.byteLength('package'))
  })
})
