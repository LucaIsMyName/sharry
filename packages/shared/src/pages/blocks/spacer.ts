import { defineBlock } from '../block.ts'
import { field } from '../fields.ts'
import { pick, spacing, spacingOptions, styleAttr } from '../style.ts'

export const spacerBlock = defineBlock({
  type: 'spacer',
  label: 'Spacer',
  description: 'Empty space between blocks.',
  icon: 'MoveVertical',
  group: 'Layout',
  fields: {
    size: field.choice({ label: 'Height', default: 'md', options: spacingOptions.filter((option) => option.value !== 'none') }),
  },
  render(props) {
    return `<div class="b-spacer" aria-hidden="true"${styleAttr({ height: pick(spacing, props.size, 'md') })}></div>`
  },
})
