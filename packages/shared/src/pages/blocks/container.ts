import { defineBlock } from '../block.ts'
import { field } from '../fields.ts'
import { color, pick, radius, radiusOptions, spacing, spacingOptions, styleAttr } from '../style.ts'

const widths = { sm: '640px', md: '860px', lg: '1100px', full: 'none' } as const

export const containerBlock = defineBlock({
  type: 'container',
  label: 'Container',
  description: 'A section that holds other blocks, with a width, spacing, and colors.',
  icon: 'Square',
  group: 'Layout',
  slots: [{ name: 'children', label: 'Content' }],
  fields: {
    width: field.choice({
      label: 'Content width',
      default: 'md',
      options: [
        { value: 'sm', label: 'Narrow' },
        { value: 'md', label: 'Medium' },
        { value: 'lg', label: 'Wide' },
        { value: 'full', label: 'Full width' },
      ],
    }),
    paddingBlock: field.choice({ label: 'Space above and below', default: 'lg', options: spacingOptions }),
    paddingInline: field.choice({ label: 'Space at the sides', default: 'md', options: spacingOptions }),
    marginBlock: field.choice({ label: 'Outer space', default: 'none', options: spacingOptions }),
    radius: field.choice({ label: 'Corners', default: 'none', options: radiusOptions }),
    background: field.color({ label: 'Background' }),
    textColor: field.color({ label: 'Text color' }),
  },
  css: '.b-container{box-sizing:border-box}.b-container>.b-inner{margin:0 auto;display:flex;flex-direction:column;gap:16px}',
  render(props, _context, slots) {
    const outer = styleAttr({
      'background-color': color(props.background),
      color: color(props.textColor),
      padding: `${pick(spacing, props.paddingBlock, 'lg')} ${pick(spacing, props.paddingInline, 'md')}`,
      margin: `${pick(spacing, props.marginBlock, 'none')} 0`,
      'border-radius': pick(radius, props.radius, 'none'),
    })
    const inner = styleAttr({ 'max-width': pick(widths, props.width, 'md') })
    return `<section class="b-container"${outer}><div class="b-inner"${inner}>${slots.children ?? ''}</div></section>`
  },
})
