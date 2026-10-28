import { defaultProps } from './fields.ts'
import { blockDefinition } from './registry.ts'
import { measureBlocks, PAGE_MAX_BLOCKS, PAGE_MAX_DEPTH, walkBlocks, type PageBlock, type PageContent } from './schema.ts'

/** Where a block sits: a slot of a parent block, or the page itself when parentId is null. */
export type BlockPlace = { parentId: string | null; slot: string | null; index: number }

const idAlphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function newBlockId(): string {
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => idAlphabet[byte % idAlphabet.length]).join('')
}

export function createBlock(type: string, id: () => string = newBlockId): PageBlock {
  const definition = blockDefinition(type)
  if (!definition) throw new Error(`Unknown block ${type}`)
  const block: PageBlock = { id: id(), type, props: defaultProps(definition.fields) }
  if (definition.slots?.length) block.slots = Object.fromEntries(definition.slots.map((slot) => [slot.name, []]))
  return block
}

/** A new page: one section with a title, a sentence, and a button. */
export function starterContent(title: string, id: () => string = newBlockId): PageContent {
  const section = createBlock('container', id)
  const heading = createBlock('heading', id)
  heading.props = { ...heading.props, text: title || 'Heading', level: 'h1' }
  section.slots = { children: [heading, createBlock('text', id), createBlock('button', id)] }
  return { blocks: [section] }
}

export function copyBlock(block: PageBlock, id: () => string = newBlockId): PageBlock {
  const copy: PageBlock = { id: id(), type: block.type, props: structuredClone(block.props) }
  if (block.slots) {
    copy.slots = Object.fromEntries(Object.entries(block.slots).map(([name, children]) => [name, children.map((child) => copyBlock(child, id))]))
  }
  return copy
}

export function findBlock(blocks: readonly PageBlock[], id: string): PageBlock | null {
  for (const block of walkBlocks(blocks)) if (block.id === id) return block
  return null
}

export function locateBlock(blocks: readonly PageBlock[], id: string, parentId: string | null = null, slot: string | null = null): BlockPlace | null {
  for (const [index, block] of blocks.entries()) {
    if (block.id === id) return { parentId, slot, index }
    for (const [name, children] of Object.entries(block.slots ?? {})) {
      const found = locateBlock(children, id, block.id, name)
      if (found) return found
    }
  }
  return null
}

export function updateBlockProps(blocks: readonly PageBlock[], id: string, props: Record<string, unknown>): PageBlock[] {
  return mapTree(blocks, (block) => (block.id === id ? { ...block, props: { ...block.props, ...props } } : block))
}

export function removeBlock(blocks: readonly PageBlock[], id: string): PageBlock[] {
  return blocks
    .filter((block) => block.id !== id)
    .map((block) =>
      block.slots
        ? { ...block, slots: Object.fromEntries(Object.entries(block.slots).map(([name, children]) => [name, removeBlock(children, id)])) }
        : block,
    )
}

/** Depth of a place: 1 for the page itself, 2 inside a top-level block, and so on. */
function placeDepth(blocks: readonly PageBlock[], parentId: string | null): number {
  if (parentId === null) return 1
  let depth = 0
  const visit = (list: readonly PageBlock[], level: number): boolean => {
    for (const block of list) {
      if (block.id === parentId) {
        depth = level + 1
        return true
      }
      for (const children of Object.values(block.slots ?? {})) if (visit(children, level + 1)) return true
    }
    return false
  }
  return visit(blocks, 1) ? depth : 0
}

/** Why a block cannot go to a place, or null when it can. */
export function insertProblem(blocks: readonly PageBlock[], place: Omit<BlockPlace, 'index'>, block: PageBlock): string | null {
  const depth = placeDepth(blocks, place.parentId)
  if (depth === 0) return 'That place no longer exists'
  if (place.parentId !== null) {
    const parent = findBlock(blocks, place.parentId)
    if (!parent?.slots || !place.slot || !(place.slot in parent.slots)) return 'That block cannot hold other blocks'
    if (findBlock([block], place.parentId)) return 'A block cannot go inside itself'
  }
  const inner = measureBlocks([block])
  if (depth - 1 + inner.depth > PAGE_MAX_DEPTH) return `Blocks can be nested at most ${PAGE_MAX_DEPTH} levels deep`
  const existing = findBlock(blocks, block.id) ? 0 : inner.count
  if (measureBlocks(blocks).count + existing > PAGE_MAX_BLOCKS) return `A page can hold at most ${PAGE_MAX_BLOCKS} blocks`
  return null
}

export function insertBlock(blocks: readonly PageBlock[], place: BlockPlace, block: PageBlock): PageBlock[] {
  if (place.parentId === null) return spliceAt(blocks, place.index, block)
  return mapTree(blocks, (current) => {
    if (current.id !== place.parentId || !current.slots || !place.slot) return current
    const children = current.slots[place.slot] ?? []
    return { ...current, slots: { ...current.slots, [place.slot]: spliceAt(children, place.index, block) } }
  })
}

/** Move a block to another place. The index is read after the block left its old place. */
export function moveBlock(blocks: readonly PageBlock[], id: string, place: BlockPlace): PageBlock[] {
  const block = findBlock(blocks, id)
  if (!block || insertProblem(blocks, place, block)) return [...blocks]
  return insertBlock(removeBlock(blocks, id), place, block)
}

/** Move a block up (-1) or down (1) among its siblings. */
export function shiftBlock(blocks: readonly PageBlock[], id: string, delta: -1 | 1): PageBlock[] {
  const place = locateBlock(blocks, id)
  if (!place) return [...blocks]
  return moveBlock(blocks, id, { ...place, index: Math.max(0, place.index + delta) })
}

export function duplicateBlock(blocks: readonly PageBlock[], id: string, makeId: () => string = newBlockId): { blocks: PageBlock[]; copyId: string | null } {
  const block = findBlock(blocks, id)
  const place = locateBlock(blocks, id)
  if (!block || !place) return { blocks: [...blocks], copyId: null }
  const copy = copyBlock(block, makeId)
  if (insertProblem(blocks, place, copy)) return { blocks: [...blocks], copyId: null }
  return { blocks: insertBlock(blocks, { ...place, index: place.index + 1 }, copy), copyId: copy.id }
}

function spliceAt(list: readonly PageBlock[], index: number, block: PageBlock): PageBlock[] {
  const next = [...list]
  next.splice(Math.max(0, Math.min(index, next.length)), 0, block)
  return next
}

function mapTree(blocks: readonly PageBlock[], change: (block: PageBlock) => PageBlock): PageBlock[] {
  return blocks.map((block) => {
    const changed = change(block)
    if (!changed.slots) return changed
    return {
      ...changed,
      slots: Object.fromEntries(Object.entries(changed.slots).map(([name, children]) => [name, mapTree(children, change)])),
    }
  })
}
