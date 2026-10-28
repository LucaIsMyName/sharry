import { describe, expect, it } from 'vitest'
import type { RenderContext } from './block.ts'
import { renderPage } from './render.ts'
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
