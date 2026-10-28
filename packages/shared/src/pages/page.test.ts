import { describe, expect, it } from 'vitest'
import type { RenderContext } from './block.ts'
import { renderBlocks, renderPage } from './render.ts'
import { defaultPageSettings, pageContentSchema, pageMediaIds, pageSettingsSchema, PAGE_MAX_BLOCKS, type PageBlock } from './schema.ts'
import {
  createBlock,
  duplicateBlock,
  findBlock,
  insertBlock,
  insertProblem,
  locateBlock,
  moveBlock,
  removeBlock,
  shiftBlock,
  starterContent,
  updateBlockProps,
} from './tree.ts'

function ids() {
  let next = 0
  return () => `b${(next += 1)}`
}

const imageId = '6f9619ff-8b86-4d01-b42d-00cf4fc964ff'
const media: RenderContext['media'] = (id) =>
  id === imageId ? { id, path: `/files/${id}/cover.png`, mime: 'image/png', alt: 'A red boat', width: 1200, height: 630 } : null

function nest(depth: number, makeId: () => string): PageBlock {
  const block = createBlock('container', makeId)
  if (depth > 1) block.slots = { children: [nest(depth - 1, makeId)] }
  return block
}

describe('page content schema', () => {
  it('fills missing props with defaults so older pages keep working', () => {
    const parsed = pageContentSchema.parse({ blocks: [{ id: 'a', type: 'heading', props: { text: 'Hi' } }] })
    expect(parsed.blocks[0]?.props).toMatchObject({ text: 'Hi', level: 'h2', align: 'left', color: null })
  })

  it('rejects unknown blocks, bad values, and duplicate ids', () => {
    expect(pageContentSchema.safeParse({ blocks: [{ id: 'a', type: 'marquee', props: {} }] }).error?.issues[0]?.message).toBe('Unknown block type')
    expect(pageContentSchema.safeParse({ blocks: [{ id: 'a', type: 'heading', props: { level: 'h6' } }] }).success).toBe(false)
    expect(pageContentSchema.safeParse({ blocks: [{ id: 'a', type: 'heading', props: { color: 'red' } }] }).success).toBe(false)
    expect(pageContentSchema.safeParse({ blocks: [{ id: 'a', type: 'button', props: { href: 'javascript:alert(1)' } }] }).success).toBe(false)
    const twice = { blocks: [createBlock('spacer', () => 'same'), createBlock('spacer', () => 'same')] }
    expect(pageContentSchema.safeParse(twice).error?.issues[0]?.message).toBe('Every block needs its own id')
  })

  it('cleans rich text on save', () => {
    const parsed = pageContentSchema.parse({ blocks: [{ id: 'a', type: 'text', props: { html: '<p onclick="x">Hi</p><script>1</script>' } }] })
    expect(parsed.blocks[0]?.props.html).toBe('<p>Hi</p>')
  })

  it('limits nesting to four levels and the page to 300 blocks', () => {
    expect(pageContentSchema.safeParse({ blocks: [nest(4, ids())] }).success).toBe(true)
    expect(pageContentSchema.safeParse({ blocks: [nest(5, ids())] }).error?.issues[0]?.message).toBe('Blocks can be nested at most 4 levels deep')
    const makeId = ids()
    const many = Array.from({ length: PAGE_MAX_BLOCKS + 1 }, () => createBlock('spacer', makeId))
    expect(pageContentSchema.safeParse({ blocks: many }).success).toBe(false)
  })

  it('reads page settings with defaults', () => {
    expect(pageSettingsSchema.parse({})).toEqual(defaultPageSettings)
    expect(defaultPageSettings).toMatchObject({ noindex: false, language: 'en', font: 'sans', ogImageId: null })
    expect(pageSettingsSchema.safeParse({ language: 'english' }).success).toBe(false)
  })

  it('lists every media file a page uses', () => {
    const image = createBlock('image', () => 'i')
    image.props.mediaId = imageId
    const video = createBlock('video', () => 'v')
    video.props = { ...video.props, mediaId: '11111111-1111-4111-8111-111111111111', posterId: imageId }
    const section = createBlock('container', () => 'c')
    section.slots = { children: [image, video] }
    expect(pageMediaIds({ blocks: [section] }, { ogImageId: '22222222-2222-4222-8222-222222222222' }).sort()).toEqual(
      ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', imageId].sort(),
    )
  })
})

describe('block tree', () => {
  it('starts a page with a section, title, text, and button', () => {
    const content = starterContent('Spring sale', ids())
    expect(content.blocks).toHaveLength(1)
    expect(content.blocks[0]?.slots?.children?.map((block) => block.type)).toEqual(['heading', 'text', 'button'])
    expect(content.blocks[0]?.slots?.children?.[0]?.props).toMatchObject({ text: 'Spring sale', level: 'h1' })
  })

  it('inserts, updates, moves, duplicates, and removes blocks', () => {
    const makeId = ids()
    let blocks = starterContent('Hi', makeId).blocks
    const section = blocks[0]!
    const columns = createBlock('columns', makeId)
    blocks = insertBlock(blocks, { parentId: null, slot: null, index: 1 }, columns)
    expect(blocks.map((block) => block.type)).toEqual(['container', 'columns'])

    const heading = section.slots!.children![0]!
    blocks = moveBlock(blocks, heading.id, { parentId: columns.id, slot: 'right', index: 0 })
    expect(locateBlock(blocks, heading.id)).toEqual({ parentId: columns.id, slot: 'right', index: 0 })
    expect(findBlock(blocks, section.id)?.slots?.children).toHaveLength(2)

    blocks = updateBlockProps(blocks, heading.id, { text: 'Changed' })
    expect(findBlock(blocks, heading.id)?.props.text).toBe('Changed')

    const copied = duplicateBlock(blocks, heading.id, makeId)
    expect(copied.copyId).not.toBeNull()
    expect(locateBlock(copied.blocks, copied.copyId!)).toEqual({ parentId: columns.id, slot: 'right', index: 1 })
    expect(findBlock(copied.blocks, copied.copyId!)?.props.text).toBe('Changed')

    blocks = shiftBlock(copied.blocks, columns.id, -1)
    expect(blocks.map((block) => block.type)).toEqual(['columns', 'container'])
    blocks = removeBlock(blocks, columns.id)
    expect(findBlock(blocks, heading.id)).toBeNull()
    expect(blocks).toHaveLength(1)
  })

  it('refuses to put a block inside itself, into a block without slots, or too deep', () => {
    const makeId = ids()
    const outer = createBlock('container', makeId)
    const inner = createBlock('container', makeId)
    outer.slots = { children: [inner] }
    const blocks = [outer, createBlock('spacer', makeId)]
    expect(insertProblem(blocks, { parentId: inner.id, slot: 'children' }, outer)).toBe('A block cannot go inside itself')
    expect(insertProblem(blocks, { parentId: blocks[1]!.id, slot: 'children' }, createBlock('text', makeId))).toBe(
      'That block cannot hold other blocks',
    )
    expect(insertProblem([nest(4, makeId)], { parentId: 'b9', slot: 'children' }, createBlock('text', makeId))).toBe('That place no longer exists')
    const deep = nest(4, ids())
    const deepest = deep.slots!.children![0]!.slots!.children![0]!.slots!.children![0]!
    expect(insertProblem([deep], { parentId: deepest.id, slot: 'children' }, createBlock('text', makeId))).toBe(
      'Blocks can be nested at most 4 levels deep',
    )
    expect(moveBlock(blocks, outer.id, { parentId: inner.id, slot: 'children', index: 0 })).toEqual(blocks)
  })
})

describe('renderPage', () => {
  it('writes a full document with social tags and no scripts', () => {
    const content = starterContent('Spring <sale>', ids())
    const html = renderPage(
      {
        title: 'Spring <sale>',
        settings: { ...defaultPageSettings, description: 'All "deals"', ogImageId: imageId, language: 'de' },
        content,
        origin: 'https://share.example.com',
        url: 'https://share.example.com/l/spring',
      },
      { media },
    )
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('<html lang="de">')
    expect(html).toContain('<title>Spring &lt;sale&gt;</title>')
    expect(html).toContain('<meta name="description" content="All &quot;deals&quot;">')
    expect(html).toContain(`<meta property="og:image" content="https://share.example.com/files/${imageId}/cover.png">`)
    expect(html).toContain('<link rel="canonical" href="https://share.example.com/l/spring">')
    expect(html).toContain('<h1 class="b-heading"')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('noindex')
  })

  it('marks noindex pages and shows a preview banner', () => {
    const html = renderPage(
      { title: 'x', settings: { ...defaultPageSettings, noindex: true }, content: { blocks: [] }, banner: 'Preview, not public' },
      { media },
    )
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">')
    expect(html).toContain('<div class="page-banner" role="status">Preview, not public</div>')
    expect(html).toContain('<body class="has-banner">')
  })

  it('wraps loose top-level blocks in page margins and skips missing media', () => {
    const makeId = ids()
    const image = createBlock('image', makeId)
    image.props.mediaId = '33333333-3333-4333-8333-333333333333'
    const html = renderPage({ title: 'x', settings: defaultPageSettings, content: { blocks: [createBlock('heading', makeId), image] } }, { media })
    expect(html).toContain('<main><div class="page-loose"><h2')
    expect(html).not.toContain('<figure')
  })

  it('uses the library alt text unless the block overrides it', () => {
    const image = createBlock('image', () => 'i')
    image.props.mediaId = imageId
    const fromLibrary = renderPage({ title: 'x', settings: defaultPageSettings, content: { blocks: [image] } }, { media })
    expect(fromLibrary).toContain('alt="A red boat"')
    image.props.alt = 'Custom'
    expect(renderPage({ title: 'x', settings: defaultPageSettings, content: { blocks: [image] } }, { media })).toContain('alt="Custom"')
  })
})

describe('container options', () => {
  it('renders a default container exactly as before the new options existed', () => {
    expect(renderBlocks([createBlock('container', () => 'c')], { media })).toBe(
      '<section class="b-container" style="padding:64px 32px;margin:0 0;border-radius:0"><div class="b-inner" style="max-width:860px"></div></section>',
    )
  })

  it('sets height, content position, alignment, border, and shadow', () => {
    const section = createBlock('container', () => 'c')
    section.props = { ...section.props, minHeight: 'screen', justify: 'center', align: 'center', borderColor: '#e4e4e7', shadow: 'soft' }
    const html = renderBlocks([section], { media })
    expect(html).toContain('min-height:100vh;justify-content:center;border:1px solid #e4e4e7;box-shadow:0 4px 16px rgba(0,0,0,.08)')
    expect(html).toContain('<div class="b-inner" style="max-width:860px;align-items:center">')
  })

  it('layers the overlay over the background image and skips a missing file', () => {
    const section = createBlock('container', () => 'c')
    section.props = { ...section.props, backgroundImageId: imageId, overlayColor: '#102030', overlayOpacity: 'medium' }
    expect(renderBlocks([section], { media })).toContain(
      `background-image:linear-gradient(rgba(16,32,48,0.5),rgba(16,32,48,0.5)),url(&quot;/files/${imageId}/cover.png&quot;);background-size:cover;background-position:center`,
    )
    section.props.overlayOpacity = 'none'
    expect(renderBlocks([section], { media })).toContain(`background-image:url(&quot;/files/${imageId}/cover.png&quot;)`)
    section.props.backgroundImageId = '33333333-3333-4333-8333-333333333333'
    expect(renderBlocks([section], { media })).not.toContain('background-image')
  })

  it('escapes a file name that tries to break out of the CSS url', () => {
    const hostile: RenderContext['media'] = (id) =>
      id ? { id, path: `/files/${id}/a"); background:url(x) ;"b.png`, mime: 'image/png', alt: null, width: null, height: null } : null
    const section = createBlock('container', () => 'c')
    section.props.backgroundImageId = imageId
    const html = renderBlocks([section], { media: hostile })
    expect(html).toContain(`url(&quot;/files/${imageId}/a%22%29%3B%20background:url%28x%29%20%3B%22b.png&quot;)`)
    expect(html).not.toContain('url(x)')
  })

  it('turns the anchor into a safe id and leaves it out when nothing usable is left', () => {
    const section = createBlock('container', () => 'c')
    section.props.anchor = ' Our Prices! '
    expect(renderBlocks([section], { media })).toContain('<section class="b-container" id="our-prices"')
    section.props.anchor = '"><script>'
    expect(renderBlocks([section], { media })).toContain('id="script"')
    section.props.anchor = '!!!'
    expect(renderBlocks([section], { media })).not.toContain(' id=')
  })
})

describe('button group', () => {
  it('renders each button with the shared colors and drops unsafe links', () => {
    const group = createBlock('buttons', () => 'g')
    group.props.items = [
      { label: 'Buy <now>', href: 'https://example.com/buy', variant: 'solid', newTab: true },
      { label: 'Read more', href: 'javascript:alert(1)', variant: 'outline', newTab: false },
    ]
    const html = renderBlocks([group], { media })
    expect(html.match(/<a class="b-button"/g)).toHaveLength(2)
    expect(html).toContain('href="https://example.com/buy" target="_blank" rel="noopener noreferrer"')
    expect(html).toContain('>Buy &lt;now&gt;</a>')
    expect(html).toContain('href="#" style="background-color:transparent;border-color:#13119b;color:#13119b')
    expect(html).not.toContain('javascript:')
  })

  it('stacks on phones only when asked', () => {
    const group = createBlock('buttons', () => 'g')
    expect(renderBlocks([group], { media })).toContain('<div class="b-buttons" style')
    group.props.stack = true
    expect(renderBlocks([group], { media })).toContain('<div class="b-buttons b-buttons-stack"')
  })

  it('brings the button styles even when the page has no single Button block', () => {
    const html = renderPage({ title: 'x', settings: defaultPageSettings, content: { blocks: [createBlock('buttons', () => 'g')] } }, { media })
    expect(html).toContain('.b-button{display:inline-block')
  })
})

describe('feature grid', () => {
  it('renders the chosen columns and card style with clean text', () => {
    const grid = createBlock('features', () => 'f')
    grid.props = {
      ...grid.props,
      columns: '4',
      cardStyle: 'filled',
      items: [{ mediaId: imageId, title: '<b>Fast</b>', html: '<p onclick="x">Quick<script>1</script></p>' }],
    }
    const html = renderBlocks([grid], { media })
    expect(html).toContain('<div class="b-features b-features-c4"')
    expect(html).toContain('background-color:#f4f4f5')
    expect(html).toContain('<h3>&lt;b&gt;Fast&lt;/b&gt;</h3>')
    expect(html).toContain('<div class="b-feature-text"><p>Quick</p></div>')
    expect(html).toContain(`<img class="b-feature-icon" src="/files/${imageId}/cover.png" alt="A red boat"`)
  })

  it('uses three columns by default and draws a line around bordered cards', () => {
    const grid = createBlock('features', () => 'f')
    grid.props.cardStyle = 'bordered'
    const html = renderBlocks([grid], { media })
    expect(html).toContain('<div class="b-features" style')
    expect(html.match(/class="b-feature"/g)).toHaveLength(3)
    expect(html).toContain('border:1px solid #f4f4f5')
  })
})

describe('image gallery', () => {
  it('skips images without a file and renders nothing when none are left', () => {
    const gallery = createBlock('gallery', () => 'g')
    expect(renderBlocks([gallery], { media })).toBe('')
    gallery.props.items = [
      { mediaId: '33333333-3333-4333-8333-333333333333', alt: '', caption: 'Gone' },
      { mediaId: imageId, alt: '', caption: 'Boat <1>' },
    ]
    const html = renderBlocks([gallery], { media })
    expect(html.match(/<figure>/g)).toHaveLength(1)
    expect(html).toContain('alt="A red boat"')
    expect(html).toContain('<figcaption>Boat &lt;1&gt;</figcaption>')
    expect(html).not.toContain('Gone')
  })

  it('applies the shape, columns, alt override, captions switch, and full image link', () => {
    const gallery = createBlock('gallery', () => 'g')
    gallery.props = {
      ...gallery.props,
      columns: '2',
      shape: 'wide',
      captions: false,
      openFull: true,
      items: [{ mediaId: imageId, alt: 'Custom "alt"', caption: 'Hidden caption' }],
    }
    const html = renderBlocks([gallery], { media })
    expect(html).toContain('<div class="b-gallery b-gallery-c2"')
    expect(html).toContain('aspect-ratio:16 / 9')
    expect(html).toContain('alt="Custom &quot;alt&quot;"')
    expect(html).toContain(`<a href="/files/${imageId}/cover.png" target="_blank" rel="noopener noreferrer"><img`)
    expect(html).not.toContain('figcaption')
  })
})

describe('media used by the new options', () => {
  it('counts the container background and the images in features and galleries', () => {
    const [a, b, c] = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444']
    const section = createBlock('container', () => 'c')
    section.props.backgroundImageId = a
    const grid = createBlock('features', () => 'f')
    grid.props.items = [{ mediaId: b, title: 'x', html: '' }]
    const gallery = createBlock('gallery', () => 'g')
    gallery.props.items = [{ mediaId: c, alt: '', caption: '' }]
    section.slots = { children: [grid, gallery] }
    expect(pageMediaIds({ blocks: [section] }).sort()).toEqual([a, b, c].sort())
  })
})
