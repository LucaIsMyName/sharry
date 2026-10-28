import type { Fields, PropsOf } from './fields.ts'

export type PageMediaRef = {
  id: string
  path: string
  mime: string
  alt: string | null
  width: number | null
  height: number | null
}

export type RenderContext = {
  /** Resolve a media library id. Unknown or deleted files return null and the block skips them. */
  media: (id: string | null) => PageMediaRef | null
}

export type BlockSlot = { name: string; label: string }

export type BlockGroup = 'Layout' | 'Content' | 'Media'

/** Lucide icons the editor can show for a block. Add a name here and in apps/web/src/components/page-builder/block-icons.tsx. */
export const blockIconNames = [
  'Square',
  'Columns2',
  'Heading',
  'Type',
  'MousePointerClick',
  'Image',
  'Video',
  'ListCollapse',
  'Quote',
  'MoveVertical',
  'Minus',
] as const
export type BlockIconName = (typeof blockIconNames)[number]

/**
 * One builder component. Everything about a block lives in its definition: the inspector fields,
 * the nested areas it holds, its validation, its defaults, and its HTML.
 */
export type BlockDefinition<F extends Fields = Fields> = {
  /** Stored in saved pages. Never rename it once pages use it. */
  type: string
  label: string
  description: string
  icon: BlockIconName
  group: BlockGroup
  fields: F
  /** Areas that hold other blocks, such as the two sides of Columns. */
  slots?: readonly BlockSlot[]
  /** Static CSS added once to a page that uses this block. Prefix classes with `b-<type>`. */
  css?: string
  /** Return HTML. Escape every value with escapeHtml and build styles with styleAttr. */
  render(props: PropsOf<F>, context: RenderContext, slots: Record<string, string>): string
}

export function defineBlock<const F extends Fields>(definition: BlockDefinition<F>): BlockDefinition<F> {
  return definition
}
