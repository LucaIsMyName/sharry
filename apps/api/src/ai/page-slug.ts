import { lookup } from 'node:dns/promises'
import type { LookupOptions } from 'node:dns'
import { isIP } from 'node:net'
import type { Database } from '@sharry/database'
import { validateSlug } from '@sharry/shared'
import { Agent } from 'undici'
import { findBySlug } from '../links.ts'

const maxBytes = 200_000
const maxRedirects = 3
const timeoutMs = 5_000

export type PageLookup = { address: string; family: number }

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>

export type PageRequestInit = Omit<FetchInit, 'dispatcher'> & { dispatcher?: unknown }

export type PageIo = {
  fetch: (input: Parameters<typeof fetch>[0], init?: PageRequestInit) => ReturnType<typeof fetch>
  lookup: (hostname: string) => Promise<PageLookup[]>
}

export const pageIo: PageIo = {
  fetch: (input, init) => fetch(input, init as RequestInit | undefined),
  lookup: async (hostname) => {
    const records = await lookup(hostname, { all: true, verbatim: true })
    return records.map((record) => ({ address: record.address, family: record.family }))
  },
}

const suggestionWords = 3

export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, suggestionWords)
    .join('-')
    .slice(0, 64)
    .replace(/-+$/g, '')
  if (!slug || validateSlug(slug)) return ''
  return slug
}

export function slugCandidates(pageUrl: string, title: string): string[] {
  const fromTitle = slugify(title)
  const fromAddress = addressSlug(pageUrl)
  return [fromTitle, fromAddress].filter((slug, index, all): slug is string => Boolean(slug) && all.indexOf(slug) === index)
}

export function isPrivateAddress(address: string): boolean {
  const lower = address.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  const mapped = ipv4FromMapped(lower)
  const ip = mapped ?? address
  if (isIP(ip) === 4) return isPrivateIPv4(ip)
  if (isIP(lower) === 6) return isPrivateIPv6(lower)
  return true
}

/** Connect only to addresses already checked, and refuse them again if they are private. */
export function pinnedLookup(addresses: PageLookup[]) {
  const allowed = addresses.filter((record) => !isPrivateAddress(record.address))
  return (_hostname: string, options: LookupOptions, callback: (error: NodeJS.ErrnoException | null, address: string | PageLookup[], family?: number) => void) => {
    const family = options.family === 4 || options.family === 'IPv4' ? 4 : options.family === 6 || options.family === 'IPv6' ? 6 : undefined
    const chosen = family ? allowed.filter((record) => record.family === family) : allowed
    if (chosen.length === 0) {
      callback(Object.assign(new Error('Address is not public'), { code: 'ENOTFOUND' }), [])
      return
    }
    if (options.all) {
      callback(null, chosen.map((record) => ({ address: record.address, family: record.family })))
      return
    }
    const first = chosen[0]
    if (!first) {
      callback(Object.assign(new Error('Address is not public'), { code: 'ENOTFOUND' }), [])
      return
    }
    callback(null, first.address, first.family)
  }
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  const a = parts[0] ?? -1
  const b = parts[1] ?? -1
  const c = parts[2] ?? -1
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 0 && c === 0) return true
  if (a === 192 && b === 168) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true
  return false
}

function isPrivateIPv6(address: string): boolean {
  const head = address.split(':')[0] ?? ''
  if (head.startsWith('fc') || head.startsWith('fd') || head.startsWith('ff')) return true
  return /^fe[89ab]/.test(head)
}

/** IPv4 embedded in ::ffff:0:0/96 or the obsolete ::/96 form, including dotted and hex spellings. */
function ipv4FromMapped(address: string): string | null {
  const dotted = address.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  let normalized = address
  if (dotted?.[1] && dotted[2] && isIP(dotted[2]) === 4) {
    const [a = 0, b = 0, c = 0, d = 0] = dotted[2].split('.').map(Number)
    normalized = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const groups = expandIpv6(normalized)
  if (!groups) return null
  const compatible = groups.slice(0, 6).every((part) => part === 0)
  const mapped = groups.slice(0, 5).every((part) => part === 0) && groups[5] === 0xffff
  if (!compatible && !mapped) return null
  const hi = groups[6] ?? 0
  const lo = groups[7] ?? 0
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`
}

function expandIpv6(address: string): number[] | null {
  if (address.includes('.')) return null
  const sides = address.split('::')
  if (sides.length > 2) return null
  const parse = (part: string) => {
    if (part === '') return []
    return part.split(':').map((piece) => (/^[0-9a-f]{1,4}$/.test(piece) ? Number.parseInt(piece, 16) : Number.NaN))
  }
  const head = parse(sides[0] ?? '')
  const tail = sides.length === 2 ? parse(sides[1] ?? '') : []
  if (head.some(Number.isNaN) || tail.some(Number.isNaN)) return null
  if (sides.length === 1) return head.length === 8 ? head : null
  const missing = 8 - head.length - tail.length
  if (missing < 1) return null
  return [...head, ...Array.from({ length: missing }, () => 0), ...tail]
}

export function titleFromHtml(html: string): string {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of metas) {
    const property = attribute(tag, 'property') || attribute(tag, 'name')
    if (property?.toLowerCase() !== 'og:title') continue
    const content = attribute(tag, 'content')?.trim()
    if (content) return decodeHtml(content)
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  return decodeHtml((title?.[1] ?? '').replace(/\s+/g, ' ').trim())
}

const titleLimit = 200

export function clipPageTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, titleLimit)
}

export async function suggestFreeSlug(
  db: Database,
  destinationUrl: string,
  options: { io?: PageIo; exceptLinkId?: string } = {},
): Promise<{ slug: string | null; title: string; fromTitle: boolean } | null> {
  const page = await readPublicPage(destinationUrl, options.io ?? pageIo)
  if (!page) return null
  const title = clipPageTitle(page.title)
  const titleSlug = slugify(page.title)
  for (const slug of slugCandidates(page.finalUrl, page.title)) {
    const taken = await findBySlug(db, slug)
    if (taken && taken.id !== options.exceptLinkId) continue
    return { slug, title, fromTitle: slug === titleSlug }
  }
  return { slug: null, title, fromTitle: false }
}

export async function readPublicPage(
  destinationUrl: string,
  io: PageIo = pageIo,
): Promise<{ title: string; finalUrl: string } | null> {
  let current: URL
  try {
    current = new URL(destinationUrl)
  } catch {
    return null
  }
  if (current.protocol !== 'http:' && current.protocol !== 'https:') return null
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const addresses = await publicAddresses(current, io)
    if (!addresses) return null
    const dispatcher = new Agent({ connect: { lookup: pinnedLookup(addresses) } })
    try {
      const response = await io.fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'text/html', 'user-agent': 'Sharry' },
        dispatcher,
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location || redirect === maxRedirects) return null
        try {
          current = new URL(location, current)
        } catch {
          return null
        }
        continue
      }
      if (!response.ok) return null
      const type = response.headers.get('content-type') ?? ''
      const html = type.includes('html') || type === '' ? await readLimited(response) : ''
      return { title: titleFromHtml(html), finalUrl: current.toString() }
    } catch {
      return null
    } finally {
      await dispatcher.close()
    }
  }
  return null
}

async function publicAddresses(url: URL, io: PageIo): Promise<PageLookup[] | null> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  try {
    const literal = isIP(url.hostname)
    const addresses = literal ? [{ address: url.hostname, family: literal }] : await io.lookup(url.hostname)
    if (addresses.length === 0 || addresses.some((record) => isPrivateAddress(record.address))) return null
    return addresses
  } catch {
    return null
  }
}

function addressSlug(pageUrl: string): string {
  const url = new URL(pageUrl)
  const host = url.hostname.replace(/^www\./i, '').split('.')[0] ?? ''
  const last = url.pathname.split('/').filter(Boolean).at(-1)?.replace(/\.[a-z0-9]+$/i, '') ?? ''
  return slugify(last ? `${host}-${last}` : host)
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  while (size < maxBytes) {
    const { done, value } = await reader.read()
    if (done || !value) break
    size += value.byteLength
    text += decoder.decode(value, { stream: true })
  }
  await reader.cancel().catch(() => undefined)
  return text.slice(0, maxBytes)
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  return match?.[1] ?? match?.[2]
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim()
}
