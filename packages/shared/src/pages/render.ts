import type { RenderContext } from './block.ts'
import { escapeHtml } from './html.ts'
import { blockDefinition } from './registry.ts'
import { PAGE_MAX_DEPTH, walkBlocks, type PageBlock, type PageContent, type PageSettings } from './schema.ts'
import { color, fonts, pick } from './style.ts'

export type RenderPageInput = {
  title: string
  settings: PageSettings
  content: PageContent
  /** Origin used for absolute social preview URLs, such as https://share.example.com. */
  origin?: string
  /** Canonical address of the public page. */
  url?: string
  /** A fixed notice at the top, used for signed-in previews of pages that are not public. */
  banner?: string | null
}

const layoutBlocks = new Set(['container', 'columns'])

const baseCss = [
  '*,*::before,*::after{box-sizing:border-box}',
  'html{-webkit-text-size-adjust:100%}',
  'body{margin:0;min-height:100vh;line-height:1.5;-webkit-font-smoothing:antialiased}',
  'main{display:flex;flex-direction:column}',
  '.page-loose{width:100%;max-width:860px;margin:0 auto;padding:12px 16px;display:flex;flex-direction:column;gap:16px}',
  'img,video{max-width:100%}',
  '.page-banner{position:fixed;inset:0 0 auto;z-index:10;height:40px;display:flex;align-items:center;justify-content:center;background:#18181b;color:#fafafa;font:500 13px/1 ui-sans-serif,system-ui,sans-serif}',
  'body.has-banner{padding-top:40px}',
].join('')

/** Render the blocks of one slot or of the page. Unknown blocks are skipped. */
export function renderBlocks(blocks: readonly PageBlock[], context: RenderContext, depth = 1): string {
  if (depth > PAGE_MAX_DEPTH) return ''
  return blocks
    .map((block) => {
      const definition = blockDefinition(block.type)
      if (!definition) return ''
      const slots: Record<string, string> = {}
      for (const slot of definition.slots ?? []) slots[slot.name] = renderBlocks(block.slots?.[slot.name] ?? [], context, depth + 1)
      return definition.render(block.props as never, context, slots)
    })
    .join('')
}

/** Group top-level content blocks so they get page margins, while sections stay full width. */
function renderTopLevel(blocks: readonly PageBlock[], context: RenderContext): string {
  const parts: string[] = []
  let loose: PageBlock[] = []
  const flush = () => {
    if (loose.length > 0) parts.push(`<div class="page-loose">${renderBlocks(loose, context)}</div>`)
    loose = []
  }
  for (const block of blocks) {
    if (layoutBlocks.has(block.type)) {
      flush()
      parts.push(renderBlocks([block], context))
    } else {
      loose.push(block)
    }
  }
  flush()
  return parts.join('')
}

export function pageCss(content: PageContent): string {
  const used = new Set<string>()
  for (const block of walkBlocks(content.blocks)) used.add(block.type)
  const blockCss = [...used].map((type) => blockDefinition(type)?.css ?? '').join('')
  return baseCss + blockCss
}

/** A complete HTML document with inline CSS and no JavaScript. Public pages and previews both use it. */
export function renderPage(input: RenderPageInput, context: RenderContext): string {
  const { settings } = input
  const title = input.title.trim() || 'Untitled page'
  const description = settings.description || settings.ogDescription
  const ogImage = context.media(settings.ogImageId)
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    description ? `<meta name="description" content="${escapeHtml(description)}">` : '',
    settings.noindex ? '<meta name="robots" content="noindex, nofollow">' : '',
    input.url ? `<link rel="canonical" href="${escapeHtml(input.url)}">` : '',
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${escapeHtml(settings.ogTitle || title)}">`,
    description ? `<meta property="og:description" content="${escapeHtml(settings.ogDescription || description)}">` : '',
    input.url ? `<meta property="og:url" content="${escapeHtml(input.url)}">` : '',
    ogImage ? `<meta property="og:image" content="${escapeHtml(`${input.origin ?? ''}${ogImage.path}`)}">` : '',
    ogImage?.alt ? `<meta property="og:image:alt" content="${escapeHtml(ogImage.alt)}">` : '',
    ogImage ? '<meta name="twitter:card" content="summary_large_image">' : '',
    `<style>${pageCss(input.content)}body{background:${color(settings.background) ?? '#ffffff'};color:${
      color(settings.textColor) ?? '#18181b'
    };font-family:${pick(fonts, settings.font, 'sans')}}</style>`,
  ]
    .filter(Boolean)
    .join('\n')
  const banner = input.banner ? `<div class="page-banner" role="status">${escapeHtml(input.banner)}</div>` : ''
  return `<!doctype html>
<html lang="${escapeHtml(settings.language || 'en')}">
<head>
${head}
</head>
<body${input.banner ? ' class="has-banner"' : ''}>${banner}<main>${renderTopLevel(input.content.blocks, context)}</main></body>
</html>`
}
