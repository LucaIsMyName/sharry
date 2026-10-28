import { decodeEntities, escapeHtml, isSafeHref } from './html.ts'

export const RICH_TEXT_MAX = 20_000

/** Tags the text editor can produce. Everything else is removed and its text kept. */
const allowedTags = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'code'])
const voidTags = new Set(['br'])
const alignable = new Set(['p', 'h2', 'h3', 'h4', 'li'])
/** These elements are dropped with their contents. */
const droppedWithContent = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'textarea', 'title'])

const tagPattern = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
const attributePattern = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

/**
 * Clean rich text from the editor against a fixed allow-list. Every kept tag is rebuilt from
 * scratch with only known attributes, text is escaped, and open tags are closed, so the output
 * cannot carry scripts, event handlers, styles other than text alignment, or unsafe links.
 */
export function cleanRichText(html: string): string {
  const output: string[] = []
  const open: string[] = []
  let dropping: string | null = null
  let last = 0
  for (const match of html.matchAll(tagPattern)) {
    const index = match.index ?? 0
    if (!dropping) output.push(escapeText(html.slice(last, index)))
    last = index + match[0].length
    const name = match[2]?.toLowerCase()
    if (!name) continue
    const closing = match[1] === '/'
    if (dropping) {
      if (closing && name === dropping) dropping = null
      continue
    }
    if (droppedWithContent.has(name)) {
      if (!closing && !match[0].endsWith('/>')) dropping = name
      continue
    }
    if (!allowedTags.has(name)) continue
    if (closing) {
      const at = open.lastIndexOf(name)
      if (at === -1) continue
      while (open.length > at) output.push(`</${open.pop()}>`)
      continue
    }
    output.push(openingTag(name, match[3] ?? ''))
    if (!voidTags.has(name)) open.push(name)
  }
  if (!dropping) output.push(escapeText(html.slice(last)))
  while (open.length > 0) output.push(`</${open.pop()}>`)
  return output.join('').replace(/<p><\/p>$/, '')
}

/** Plain text of cleaned rich text, for descriptions and search. */
export function richTextToPlain(html: string): string {
  return decodeEntities(cleanRichText(html).replace(/<br>/g, ' ').replace(/<\/(p|li|h2|h3|h4|blockquote)>/g, ' ').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

function openingTag(name: string, rawAttributes: string): string {
  const attributes = readAttributes(rawAttributes)
  const kept: string[] = []
  if (name === 'a') {
    const href = attributes.get('href')?.trim() ?? ''
    if (href && isSafeHref(href)) kept.push(`href="${escapeHtml(href)}"`)
    if (attributes.get('target') === '_blank') kept.push('target="_blank" rel="noopener noreferrer"')
  }
  if (alignable.has(name)) {
    const align = attributes.get('style')?.match(/text-align\s*:\s*(left|center|right|justify)\b/i)?.[1]?.toLowerCase()
    if (align) kept.push(`style="text-align: ${align}"`)
  }
  return kept.length > 0 ? `<${name} ${kept.join(' ')}>` : `<${name}>`
}

function readAttributes(raw: string): Map<string, string> {
  const attributes = new Map<string, string>()
  for (const match of raw.matchAll(attributePattern)) {
    const name = match[1]?.toLowerCase()
    if (!name || attributes.has(name)) continue
    attributes.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''))
  }
  return attributes
}

function escapeText(text: string): string {
  return text.replace(/&(?!(?:#x[0-9a-f]+|#\d+|[a-z]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
