import { z } from 'zod'
import { HEX_COLOR, propsSchema } from './fields.ts'
import { blockDefinition, pageBlocks } from './registry.ts'
import { fonts } from './style.ts'

export const PAGE_MAX_BLOCKS = 300
/** Blocks inside blocks: a container holding columns holding a container holding text is four levels. */
export const PAGE_MAX_DEPTH = 4

export type PageBlock = {
  id: string
  type: string
  props: Record<string, unknown>
  slots?: Record<string, PageBlock[]>
}

export type PageContent = { blocks: PageBlock[] }

const blockId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Invalid block id')

function definitionSchema(type: string) {
  const definition = blockDefinition(type)
  if (!definition) throw new Error(`Unknown block ${type}`)
  const slots = definition.slots ?? []
  return z.object({
    id: blockId,
    type: z.literal(definition.type),
    props: propsSchema(definition.fields),
    ...(slots.length > 0
      ? {
          slots: z
            .object(Object.fromEntries(slots.map((slot) => [slot.name, z.array(pageBlockSchema).max(PAGE_MAX_BLOCKS).default([])])))
            .default({}),
        }
      : {}),
  })
}

export const pageBlockSchema: z.ZodType<PageBlock, z.ZodTypeDef, unknown> = z.lazy(() => {
  const [first, second, ...rest] = pageBlocks.map((definition) => definitionSchema(definition.type))
  if (!first || !second) throw new Error('The page builder needs at least two blocks')
  return z.discriminatedUnion('type', [first, second, ...rest], {
    errorMap: (issue, context) =>
      issue.code === 'invalid_union_discriminator' ? { message: 'Unknown block type' } : { message: context.defaultError },
  })
}) as z.ZodType<PageBlock, z.ZodTypeDef, unknown>

export const pageContentSchema = z
  .object({ blocks: z.array(pageBlockSchema).max(PAGE_MAX_BLOCKS).default([]) })
  .superRefine((content, context) => {
    const { count, depth } = measureBlocks(content.blocks)
    if (count > PAGE_MAX_BLOCKS) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `A page can hold at most ${PAGE_MAX_BLOCKS} blocks` })
    }
    if (depth > PAGE_MAX_DEPTH) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Blocks can be nested at most ${PAGE_MAX_DEPTH} levels deep` })
    }
    const ids = new Set<string>()
    for (const block of walkBlocks(content.blocks)) {
      if (ids.has(block.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Every block needs its own id' })
        return
      }
      ids.add(block.id)
    }
  })

const fontKeys = Object.keys(fonts).filter((key) => key !== 'inherit') as [string, ...string[]]

export const pageSettingsSchema = z
  .object({
    description: z.string().trim().max(300).default(''),
    ogTitle: z.string().trim().max(200).default(''),
    ogDescription: z.string().trim().max(300).default(''),
    ogImageId: z.string().uuid().nullable().default(null),
    noindex: z.boolean().default(false),
    language: z
      .string()
      .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/, 'Use a language code such as en or de-AT')
      .default('en'),
    background: z.string().regex(HEX_COLOR).default('#ffffff'),
    textColor: z.string().regex(HEX_COLOR).default('#18181b'),
    font: z.enum(fontKeys).default('sans'),
  })
  .default({})

export type PageSettings = z.output<typeof pageSettingsSchema>

export const defaultPageSettings: PageSettings = pageSettingsSchema.parse(undefined)

export function* walkBlocks(blocks: readonly PageBlock[]): Generator<PageBlock> {
  for (const block of blocks) {
    yield block
    for (const children of Object.values(block.slots ?? {})) yield* walkBlocks(children)
  }
}

export function measureBlocks(blocks: readonly PageBlock[], level = 1): { count: number; depth: number } {
  let count = 0
  let depth = blocks.length > 0 ? level : level - 1
  for (const block of blocks) {
    count += 1
    for (const children of Object.values(block.slots ?? {})) {
      const inner = measureBlocks(children, level + 1)
      count += inner.count
      depth = Math.max(depth, inner.depth)
    }
  }
  return { count, depth }
}

/** Media library ids a page uses, from every media field in its blocks and settings. */
export function pageMediaIds(content: PageContent, settings?: Pick<PageSettings, 'ogImageId'>): string[] {
  const ids = new Set<string>()
  if (settings?.ogImageId) ids.add(settings.ogImageId)
  for (const block of walkBlocks(content.blocks)) {
    const definition = blockDefinition(block.type)
    if (!definition) continue
    for (const [name, spec] of Object.entries(definition.fields)) {
      if (spec.kind === 'media' && typeof block.props[name] === 'string') ids.add(block.props[name])
      if (spec.kind !== 'list' || !Array.isArray(block.props[name])) continue
      for (const item of block.props[name] as Record<string, unknown>[]) {
        for (const [itemName, itemSpec] of Object.entries(spec.item)) {
          if (itemSpec.kind === 'media' && typeof item[itemName] === 'string') ids.add(item[itemName])
        }
      }
    }
  }
  return [...ids]
}
