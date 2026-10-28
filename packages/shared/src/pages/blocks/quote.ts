import { defineBlock } from '../block.ts'
import { field } from '../fields.ts'
import { escapeHtml } from '../html.ts'
import { alignOptions, color, fontOptions, fonts, pick, styleAttr } from '../style.ts'

export const quoteBlock = defineBlock({
  type: 'quote',
  label: 'Quote',
  description: 'A highlighted quote or testimonial with an optional source.',
  icon: 'Quote',
  group: 'Content',
  fields: {
    text: field.text({ label: 'Quote', max: 1000, multiline: true, default: 'A sentence worth repeating.' }),
    cite: field.text({ label: 'Source', max: 200, help: 'Who said it, for example a name and role.' }),
    variant: field.choice({
      label: 'Style',
      default: 'bordered',
      options: [
        { value: 'plain', label: 'Plain' },
        { value: 'bordered', label: 'Line at the side' },
        { value: 'large', label: 'Large' },
      ],
    }),
    align: field.choice({ label: 'Alignment', default: 'left', options: alignOptions }),
    font: field.choice({ label: 'Font', default: 'serif', options: fontOptions }),
    color: field.color({ label: 'Color' }),
  },
  css: '.b-quote{margin:0;display:flex;flex-direction:column;gap:8px}.b-quote p{margin:0;line-height:1.5;white-space:pre-line}.b-quote.bordered{border-left:3px solid currentColor;padding-left:16px}.b-quote.large p{font-size:1.5rem;font-weight:500}.b-quote cite{font-style:normal;font-size:.875rem;opacity:.75}',
  render(props) {
    const variant = props.variant === 'plain' || props.variant === 'large' ? props.variant : 'bordered'
    const style = styleAttr({
      'text-align': props.align,
      'font-family': props.font === 'inherit' ? null : pick(fonts, props.font, 'inherit'),
      color: color(props.color),
    })
    const cite = props.cite ? `<cite>${escapeHtml(props.cite)}</cite>` : ''
    return `<blockquote class="b-quote ${variant}"${style}><p>${escapeHtml(props.text)}</p>${cite}</blockquote>`
  },
})
