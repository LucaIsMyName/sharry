import fs from 'node:fs/promises'
import path from 'node:path'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { links, qrCodes, type Database } from '@sharry/database'
import type { RuntimeEnv } from '@sharry/shared'
import { removeLogo } from './links.ts'
import { storeMedia } from './media.ts'

/**
 * Move QR center images from QR_DATA_DIR into the media library. Each file becomes a media item owned by the link owner.
 * Safe to run on every start: rows that already point at a media item are skipped.
 */
export async function moveQrLogosToMedia(db: Database, env: RuntimeEnv): Promise<number> {
  const rows = await db
    .select({ id: qrCodes.id, name: qrCodes.name, logoPath: qrCodes.logoPath, userId: links.userId, slug: links.slug })
    .from(qrCodes)
    .innerJoin(links, eq(links.id, qrCodes.linkId))
    .where(and(isNotNull(qrCodes.logoPath), isNull(qrCodes.logoMediaId)))
  let moved = 0
  for (const row of rows) {
    const filename = row.logoPath
    if (!filename || filename.includes('/') || filename.includes('..')) {
      await db.update(qrCodes).set({ logoPath: null }).where(eq(qrCodes.id, row.id))
      continue
    }
    const buffer = await fs.readFile(path.join(env.QR_DATA_DIR, filename)).catch(() => null)
    if (!buffer) {
      await db.update(qrCodes).set({ logoPath: null }).where(eq(qrCodes.id, row.id))
      continue
    }
    const media = await storeMedia(db, env, {
      userId: row.userId,
      folderId: null,
      buffer,
      originalName: `${row.slug} ${row.name} QR center image${path.extname(filename)}`,
    }).catch(() => null)
    if (!media) continue
    await db.update(qrCodes).set({ logoMediaId: media.id, logoPath: null }).where(eq(qrCodes.id, row.id))
    await removeLogo(env.QR_DATA_DIR, filename)
    moved += 1
  }
  return moved
}
