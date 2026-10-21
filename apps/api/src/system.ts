import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sharry/database'
import { requireAdmin } from './auth.ts'
import { rowsOf } from './settings-store.ts'
import { AppError } from './support.ts'

export type SystemSnapshot = {
  collectedAt: string
  memory: {
    totalBytes: number
    availableBytes: number
    usedBytes: number
    processRssBytes: number
  }
  storage: {
    totalBytes: number
    availableBytes: number
    usedBytes: number
    databaseBytes: number
  }
  os: {
    platform: string
    type: string
    release: string
    arch: string
    hostname: string
  }
  cpu: {
    cores: number
    loadAverage: [number, number, number]
  }
  uptime: {
    systemSeconds: number
    processSeconds: number
  }
  runtime: {
    packageName: string
    packageVersion: string
    nodeVersion: string
    postgresVersion: string
  }
}

export function registerSystemRoutes(app: FastifyInstance): void {
  /**
   * Read live memory, disk, operating system, and runtime versions for this host.
   * @route GET /api/admin/system
   * @tag Admin
   * @auth admin api-key or admin session
   * @response 200 { collectedAt, memory, storage, os, cpu, uptime, runtime }
   */
  app.get('/api/admin/system', async (request) => {
    await requireAdmin(app, request)
    return readSystemSnapshot(app.db)
  })
}

export async function readSystemSnapshot(db: Database): Promise<SystemSnapshot> {
  const [memory, storage, database, installed] = await Promise.all([
    hostMemory(),
    diskUsage(process.cwd()),
    databaseUsage(db),
    installedPackage(),
  ])
  const load = os.loadavg()
  return {
    collectedAt: new Date().toISOString(),
    memory: {
      ...splitUsage(memory.totalBytes, memory.availableBytes),
      processRssBytes: process.memoryUsage().rss,
    },
    storage: {
      ...storage,
      databaseBytes: database.bytes,
    },
    os: {
      platform: os.platform(),
      type: os.type(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
    },
    cpu: {
      cores: os.availableParallelism(),
      loadAverage: [load[0] ?? 0, load[1] ?? 0, load[2] ?? 0],
    },
    uptime: {
      systemSeconds: Math.floor(os.uptime()),
      processSeconds: Math.floor(process.uptime()),
    },
    runtime: {
      packageName: installed.name,
      packageVersion: installed.version,
      nodeVersion: process.version,
      postgresVersion: database.version,
    },
  }
}

export function memoryFromProc(text: string): { totalBytes: number; availableBytes: number } | null {
  const totalBytes = fieldKibibytes(text, 'MemTotal')
  const available = fieldKibibytes(text, 'MemAvailable')
  if (totalBytes === null || available === null || totalBytes <= 0) return null
  return { totalBytes, availableBytes: Math.min(Math.max(0, available), totalBytes) }
}

async function hostMemory(): Promise<{ totalBytes: number; availableBytes: number }> {
  if (os.platform() === 'linux') {
    try {
      const parsed = memoryFromProc(await fs.readFile('/proc/meminfo', 'utf8'))
      if (parsed) return parsed
    } catch {
      // Fall back to the Node figures when meminfo cannot be read.
    }
  }
  const totalBytes = os.totalmem()
  return { totalBytes, availableBytes: Math.min(os.freemem(), totalBytes) }
}

function fieldKibibytes(text: string, name: string): number | null {
  const match = new RegExp(`^${name}:\\s+(\\d+)\\s+kB\\s*$`, 'm').exec(text)
  if (!match?.[1]) return null
  return Number(match[1]) * 1024
}

function splitUsage(totalBytes: number, availableBytes: number): { totalBytes: number; availableBytes: number; usedBytes: number } {
  const available = Math.min(Math.max(0, availableBytes), totalBytes)
  return { totalBytes, availableBytes: available, usedBytes: totalBytes - available }
}

async function diskUsage(directory: string): Promise<{ totalBytes: number; availableBytes: number; usedBytes: number }> {
  const stats = await fs.statfs(directory)
  const totalBytes = scale(stats.blocks, stats.bsize)
  const freeBytes = scale(stats.bfree, stats.bsize)
  const availableBytes = Math.min(scale(stats.bavail, stats.bsize), freeBytes, totalBytes)
  return { totalBytes, availableBytes, usedBytes: Math.max(0, totalBytes - freeBytes) }
}

function scale(count: number, size: number): number {
  const bytes = count * size
  return Number.isFinite(bytes) ? Math.max(0, Math.round(bytes)) : 0
}

async function databaseUsage(db: Database): Promise<{ bytes: number; version: string }> {
  const result = await db.execute<{ bytes: unknown; version: unknown }>(sql`
    select pg_database_size(current_database()) as bytes, version() as version
  `)
  const row = rowsOf<{ bytes: unknown; version: unknown }>(result)[0]
  if (!row || typeof row.version !== 'string' || !row.version) throw new AppError(500, 'Could not read the database')
  return { bytes: bytesOf(row.bytes), version: row.version }
}

function bytesOf(value: unknown): number {
  const bytes = typeof value === 'bigint' ? Number(value) : typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(bytes) || bytes < 0) throw new AppError(500, 'Could not read the database size')
  return Math.round(bytes)
}

async function installedPackage(): Promise<{ name: string; version: string }> {
  const files = [
    fileURLToPath(new URL('../../../package.json', import.meta.url)),
    path.join(process.cwd(), 'package.json'),
  ]
  for (const file of files) {
    const parsed = await readPackage(file)
    if (parsed) return parsed
  }
  throw new AppError(500, 'Could not read the installed package')
}

async function readPackage(file: string): Promise<{ name: string; version: string } | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as { name?: unknown; version?: unknown }
    if (typeof parsed.name === 'string' && parsed.name && typeof parsed.version === 'string' && parsed.version) {
      return { name: parsed.name, version: parsed.version }
    }
    return null
  } catch {
    return null
  }
}
