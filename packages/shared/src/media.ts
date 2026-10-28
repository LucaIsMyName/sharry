export const mediaKinds = ['image', 'video', 'document'] as const
export type MediaKind = (typeof mediaKinds)[number]

export type MediaType = { mime: string; kind: MediaKind; ext: string }

export const mediaTypes = {
  jpeg: { mime: 'image/jpeg', kind: 'image', ext: 'jpg' },
  png: { mime: 'image/png', kind: 'image', ext: 'png' },
  webp: { mime: 'image/webp', kind: 'image', ext: 'webp' },
  gif: { mime: 'image/gif', kind: 'image', ext: 'gif' },
  svg: { mime: 'image/svg+xml', kind: 'image', ext: 'svg' },
  mp4: { mime: 'video/mp4', kind: 'video', ext: 'mp4' },
  webm: { mime: 'video/webm', kind: 'video', ext: 'webm' },
  pdf: { mime: 'application/pdf', kind: 'document', ext: 'pdf' },
} as const satisfies Record<string, MediaType>

export const mediaAccept = Object.values(mediaTypes)
  .map((type) => type.mime)
  .join(',')

export const rasterImageMimes: readonly string[] = [mediaTypes.jpeg.mime, mediaTypes.png.mime, mediaTypes.webp.mime]

export const MEDIA_TYPE_MESSAGE = 'Use a JPEG, PNG, WebP, GIF, SVG, MP4, WebM, or PDF file'
export const MEDIA_UNSAFE_SVG_MESSAGE = 'This SVG contains scripts or external content and cannot be uploaded'

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((value, index) => bytes[offset + index] === value)
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, Math.min(end, bytes.length)))
}

/** Detect the file type from its first bytes. The file name and the browser's MIME type are not trusted. */
export function detectMediaType(bytes: Uint8Array): MediaType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return mediaTypes.jpeg
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return mediaTypes.png
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return mediaTypes.webp
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return mediaTypes.gif
  if (ascii(bytes, 0, 5) === '%PDF-') return mediaTypes.pdf
  if (ascii(bytes, 4, 8) === 'ftyp' && !ascii(bytes, 8, 12).startsWith('qt')) return mediaTypes.mp4
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return mediaTypes.webm
  if (looksLikeSvg(bytes)) return mediaTypes.svg
  return null
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 4096)
  if (head.includes(0)) return false
  const text = new TextDecoder('utf-8', { fatal: false }).decode(head).replace(/^\uFEFF/, '')
  const body = text
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .trimStart()
  return /^<svg[\s>]/i.test(body)
}

/** An SVG that can run code or load other files is refused instead of cleaned. */
export function svgIsUnsafe(text: string): boolean {
  return (
    /<script[\s>/]/i.test(text) ||
    /<foreignObject[\s>/]/i.test(text) ||
    /<!ENTITY/i.test(text) ||
    /\son[a-z]+\s*=/i.test(text) ||
    /javascript:/i.test(text) ||
    /(?:href|src)\s*=\s*["']\s*(?!#|data:image\/)[^"'\s]/i.test(text) ||
    /url\(\s*["']?\s*(?!#|data:image\/)[a-z]+:/i.test(text) ||
    /@import/i.test(text)
  )
}

/** A readable file name: no folders, control characters, or leading dots, and at most 120 characters. */
export function mediaDisplayName(original: string, ext: string): string {
  const base = original.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
  const stem = cleaned.replace(/\.[^.]*$/, '').trim() || 'file'
  const suffix = `.${ext}`
  return `${stem.slice(0, 120 - suffix.length)}${suffix}`
}

/** Return name, or "name (2).ext" and so on when the folder already has that name. */
export function uniqueMediaName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((item) => item.toLowerCase()))
  if (!used.has(name.toLowerCase())) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let count = 2; count < 10_000; count += 1) {
    const candidate = `${stem} (${count})${ext}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
  return `${stem} (${Date.now()})${ext}`
}

export function mediaFilePath(id: string, name: string): string {
  return `/files/${id}/${encodeURIComponent(name)}`
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
