import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { Database } from '@sharry/database'
import { validateSlug } from '@sharry/shared'
import { findBySlug } from '../links.ts'

const maxBytes = 200_000
const maxRedirects = 3
const timeoutMs = 5_000

export type PageLookup = { address: string; family: number }

export type PageIo = {
  fetch: typeof fetch
  lookup: (hostname: string) => Promise<PageLookup[]>
}

export const pageIo: PageIo = {
  fetch: (input, init) => fetch(input, init),
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
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  const ip = mapped?.[1] ?? address
  if (isIP(ip) === 4) {
    const [a = -1, b = -1] = ip.split('.').map(Number)
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }
  if (isIP(address) === 6) {
    const lower = address.toLowerCase()
    if (lower === '::' || lower === '::1') return true
    const head = lower.split(':')[0] ?? ''
    if (head.startsWith('fc') || head.startsWith('fd')) return true
    if (/^fe[89ab]/.test(head)) return true
    return false
  }
  return true
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
    if (!(await isPublicHttpUrl(current, io))) return null
    let response: Response
    try {
      response = await io.fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'text/html', 'user-agent': 'Sharry' },
      })
    } catch {
      return null
    }
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
  }
  return null
}

async function isPublicHttpUrl(url: URL, io: PageIo): Promise<boolean> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  try {
    const addresses = isIP(url.hostname) ? [url.hostname] : (await io.lookup(url.hostname)).map((record) => record.address)
    return addresses.length > 0 && addresses.every((address) => !isPrivateAddress(address))
  } catch {
    return false
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
