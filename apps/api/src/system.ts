import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Database } from '@sharry/database'
import type { RuntimeEnv } from '@sharry/shared'
import { requireAdmin } from './auth.ts'
import { rowsOf } from './settings-store.ts'
import { AppError } from './support.ts'

const execFileAsync = promisify(execFile)

export const storagePartIds = ['operatingSystem', 'node', 'code', 'packages', 'media', 'database'] as const

export type StoragePartId = (typeof storagePartIds)[number]

export type StoragePart = { id: StoragePartId; bytes: number }

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
    parts: StoragePart[]
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
   * Read live memory, disk, operating system, and runtime versions for this host. The storage section lists the operating system, Node, application code, packages, media files, and the database.
   * @route GET /api/admin/system
   * @tag Admin
   * @auth admin api-key or admin session
   * @response 200 { collectedAt, memory, storage, os, cpu, uptime, runtime }
   */
  app.get('/api/admin/system', async (request) => {
    await requireAdmin(app, request)
    return readSystemSnapshot(app.db, app.env)
  })
}

export async function readSystemSnapshot(db: Database, env: RuntimeEnv): Promise<SystemSnapshot> {
  const appRoot = process.cwd()
  const mediaDirs = disjointDirs([
    path.resolve(appRoot, env.MEDIA_DATA_DIR),
    path.resolve(appRoot, env.AVATAR_DATA_DIR),
    path.resolve(appRoot, env.QR_DATA_DIR),
  ])
  const [memory, storage, database, installed, appBytes, mediaBytes] = await Promise.all([
    hostMemory(),
    diskUsage(appRoot),
    databaseUsage(db),
    installedPackage(),
    measureApp(appRoot, mediaDirs),
    sumBytes(mediaDirs),
  ])
  const buckets = { codeBytes: appBytes.codeBytes, packageBytes: appBytes.packageBytes }
  const nodeBytes = await nodeInstallBytes(process.execPath, appRoot, buckets)
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
      parts: storageParts({
        usedBytes: storage.usedBytes,
        nodeBytes,
        codeBytes: buckets.codeBytes,
        packageBytes: buckets.packageBytes,
        mediaBytes,
        databaseBytes: database.bytes,
      }),
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

export function storageParts(input: {
  usedBytes: number
  nodeBytes: number
  codeBytes: number
  packageBytes: number
  mediaBytes: number
  databaseBytes: number
}): StoragePart[] {
  const node = nonNegative(input.nodeBytes)
  const code = nonNegative(input.codeBytes)
  const packages = nonNegative(input.packageBytes)
  const media = nonNegative(input.mediaBytes)
  const database = nonNegative(input.databaseBytes)
  const named = node + code + packages + media + database
  return [
    { id: 'operatingSystem', bytes: Math.max(0, nonNegative(input.usedBytes) - named) },
    { id: 'node', bytes: node },
    { id: 'code', bytes: code },
    { id: 'packages', bytes: packages },
    { id: 'media', bytes: media },
    { id: 'database', bytes: database },
  ]
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

/** A versioned Node prefix, or the binary plus the npm library next to a system Node. */
export function nodeStoragePaths(execPath: string): string[] {
  const resolved = path.resolve(execPath)
  const binDir = path.dirname(resolved)
  if (path.basename(binDir) !== 'bin') return [resolved]
  const prefix = path.dirname(binDir)
  const normalized = prefix.split(path.sep).join('/')
  if (/\/\.nvm\/versions\/node\/[^/]+$/.test(normalized) || /\/node\/v?\d+\.\d+\.\d+$/.test(normalized)) return [prefix]
  return [resolved, path.join(prefix, 'lib', 'node_modules', 'npm')]
}

async function nodeInstallBytes(
  execPath: string,
  appRoot: string,
  buckets: { codeBytes: number; packageBytes: number },
): Promise<number> {
  const paths = nodeStoragePaths(execPath)
  if (paths.every((item) => !isInside(item, appRoot))) return sumBytes(paths)
  const binary = await directoryBytes(execPath)
  const modules = path.resolve(appRoot, 'node_modules')
  if (isInside(execPath, modules)) buckets.packageBytes = Math.max(0, buckets.packageBytes - binary)
  else if (isInside(execPath, appRoot)) buckets.codeBytes = Math.max(0, buckets.codeBytes - binary)
  return binary
}

/** Code is the app tree. Packages are every node_modules directory. Skipped directories are left out of both. */
export async function measureApp(appRoot: string, skip: readonly string[]): Promise<{ codeBytes: number; packageBytes: number }> {
  const root = path.resolve(appRoot)
  const skipSet = new Set(skip.map((item) => path.resolve(item)))
  const packageDirs: string[] = []
  let codeBytes = 0

  async function walk(dir: string): Promise<void> {
    if (skipSet.has(dir)) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const next = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') {
          packageDirs.push(next)
          continue
        }
        if (entry.name === '.git' || (entry.name === 'data' && path.resolve(next) === path.resolve(root, 'data')) || skipSet.has(path.resolve(next))) continue
        await walk(next)
        continue
      }
      if (!entry.isFile()) continue
      try {
        codeBytes += (await fs.lstat(next)).size
      } catch {
        // An unreadable file stays out of the code total.
      }
    }
  }

  await walk(root)
  const packageBytes = (await Promise.all(packageDirs.map((dir) => directoryBytes(dir)))).reduce((sum, value) => sum + value, 0)
  return { codeBytes, packageBytes }
}

export async function directoryBytes(target: string): Promise<number> {
  const resolved = path.resolve(target)
  try {
    const stats = await fs.lstat(resolved)
    if (stats.isSymbolicLink()) return 0
    if (stats.isFile()) return stats.size
  } catch {
    return 0
  }
  const measured = await duBytes(resolved)
  if (measured !== null) return measured
  return walkBytes(resolved)
}

async function duBytes(target: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('du', ['-sk', target], { timeout: 60_000 })
    const blocks = Number(stdout.trim().split(/\s+/)[0])
    if (!Number.isFinite(blocks) || blocks < 0) return null
    return Math.round(blocks * 1024)
  } catch {
    return null
  }
}

async function walkBytes(dir: string): Promise<number> {
  let total = 0
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const next = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      total += await walkBytes(next)
      continue
    }
    if (!entry.isFile()) continue
    try {
      total += (await fs.lstat(next)).size
    } catch {
      // Skip a file that disappears while the tree is read.
    }
  }
  return total
}

async function sumBytes(targets: readonly string[]): Promise<number> {
  const sizes = await Promise.all(targets.map((target) => directoryBytes(target)))
  return sizes.reduce((sum, value) => sum + value, 0)
}

function disjointDirs(targets: readonly string[]): string[] {
  const resolved = [...new Set(targets.map((item) => path.resolve(item)))]
  return resolved.filter((item) => !resolved.some((other) => other !== item && isInside(item, other)))
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
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
