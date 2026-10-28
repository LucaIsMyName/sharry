import { defineBlock } from '../block.ts'
import { field } from '../fields.ts'
import { color, pick, spacing, spacingOptions, styleAttr } from '../style.ts'

export const dividerBlock = defineBlock({
  type: 'divider',
  label: 'Divider',
  description: 'A horizontal line between sections.',
  icon: 'Minus',
  group: 'Layout',
  fields: {
    lineStyle: field.choice({
      label: 'Line',
      default: 'solid',
      options: [
        { value: 'solid', label: 'Solid' },
        { value: 'dashed', label: 'Dashed' },
        { value: 'dotted', label: 'Dotted' },
      ],
    }),
    width: field.choice({
      label: 'Width',
      default: 'full',
      options: [
        { value: 'full', label: 'Full width' },
        { value: 'short', label: 'Short' },
      ],
    }),
    spacing: field.choice({ label: 'Space around', default: 'sm', options: spacingOptions }),
    color: field.color({ label: 'Color', default: '#e4e4e7' }),
  },
  render(props) {
    const style = styleAttr({
      border: '0',
      'border-top': `1px ${props.lineStyle === 'dashed' || props.lineStyle === 'dotted' ? props.lineStyle : 'solid'} ${color(props.color) ?? '#e4e4e7'}`,
      width: props.width === 'short' ? '96px' : '100%',
      margin: `${pick(spacing, props.spacing, 'sm')} auto`,
    })
    return `<hr class="b-divider"${style}>`
  },
})
