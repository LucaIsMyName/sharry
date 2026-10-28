import type { BlockDefinition } from './block.ts'
import { accordionBlock } from './blocks/accordion.ts'
import { buttonBlock } from './blocks/button.ts'
import { buttonGroupBlock } from './blocks/button-group.ts'
import { columnsBlock } from './blocks/columns.ts'
import { containerBlock } from './blocks/container.ts'
import { dividerBlock } from './blocks/divider.ts'
import { featuresBlock } from './blocks/features.ts'
import { galleryBlock } from './blocks/gallery.ts'
import { headingBlock } from './blocks/heading.ts'
import { imageBlock } from './blocks/image.ts'
import { quoteBlock } from './blocks/quote.ts'
import { spacerBlock } from './blocks/spacer.ts'
import { textBlock } from './blocks/text.ts'
import { videoBlock } from './blocks/video.ts'

/**
 * Every block the builder offers, in the order of the Add block menu.
 * To add a component, create a file in ./blocks and list it here. Nothing else is required.
 */
export const pageBlocks: readonly BlockDefinition[] = [
  containerBlock,
  columnsBlock,
  headingBlock,
  textBlock,
  buttonBlock,
  buttonGroupBlock,
  featuresBlock,
  imageBlock,
  galleryBlock,
  videoBlock,
  accordionBlock,
  quoteBlock,
  spacerBlock,
  dividerBlock,
]

const byType = new Map(pageBlocks.map((definition) => [definition.type, definition]))

export function blockDefinition(type: string): BlockDefinition | undefined {
  return byType.get(type)
}
