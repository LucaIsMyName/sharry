import { defineBlock } from '../block.ts'
import { field } from '../fields.ts'
import { color, pick, spacing, spacingOptions, styleAttr } from '../style.ts'

const ratios = { '1-1': '1fr 1fr', '2-1': '2fr 1fr', '1-2': '1fr 2fr' } as const
const alignments = { top: 'start', center: 'center', bottom: 'end' } as const

export const columnsBlock = defineBlock({
  type: 'columns',
  label: 'Two columns',
  description: 'Two areas side by side. On a phone they stack.',
  icon: 'Columns2',
  group: 'Layout',
  slots: [
    { name: 'left', label: 'Left column' },
    { name: 'right', label: 'Right column' },
  ],
  fields: {
    ratio: field.choice({
      label: 'Column widths',
      default: '1-1',
      options: [
        { value: '1-1', label: 'Equal' },
        { value: '2-1', label: 'Wider left' },
        { value: '1-2', label: 'Wider right' },
      ],
    }),
    gap: field.choice({ label: 'Gap', default: 'md', options: spacingOptions }),
    align: field.choice({
      label: 'Vertical alignment',
      default: 'top',
      options: [
        { value: 'top', label: 'Top' },
        { value: 'center', label: 'Center' },
        { value: 'bottom', label: 'Bottom' },
      ],
    }),
    padding: field.choice({ label: 'Inner space', default: 'none', options: spacingOptions }),
    background: field.color({ label: 'Background' }),
    textColor: field.color({ label: 'Text color' }),
  },
  css:
    '.b-columns{display:grid;box-sizing:border-box}.b-columns>div{display:flex;flex-direction:column;gap:16px;min-width:0}@media (max-width:640px){.b-columns{grid-template-columns:1fr!important}}',
  render(props, _context, slots) {
    const style = styleAttr({
      'grid-template-columns': pick(ratios, props.ratio, '1-1'),
      gap: pick(spacing, props.gap, 'md'),
      'align-items': pick(alignments, props.align, 'top'),
      padding: pick(spacing, props.padding, 'none'),
      'background-color': color(props.background),
      color: color(props.textColor),
    })
    return `<div class="b-columns"${style}><div>${slots.left ?? ''}</div><div>${slots.right ?? ''}</div></div>`
  },
})
