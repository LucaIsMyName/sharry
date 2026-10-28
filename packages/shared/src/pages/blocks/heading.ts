import { defineBlock } from '../block.ts'
import { field } from '../fields.ts'
import { escapeHtml } from '../html.ts'
import { alignOptions, color, fontOptions, fonts, pick, styleAttr } from '../style.ts'

const sizes = { h1: 'clamp(2rem, 5vw, 3rem)', h2: 'clamp(1.5rem, 3.5vw, 2.25rem)', h3: '1.375rem' } as const

export const headingBlock = defineBlock({
  type: 'heading',
  label: 'Heading',
  description: 'A title. Use one Heading 1 per page and Heading 2 or 3 for sections.',
  icon: 'Heading',
  group: 'Content',
  fields: {
    text: field.text({ label: 'Text', max: 200, default: 'Heading' }),
    level: field.choice({
      label: 'Level',
      default: 'h2',
      options: [
        { value: 'h1', label: 'Heading 1' },
        { value: 'h2', label: 'Heading 2' },
        { value: 'h3', label: 'Heading 3' },
      ],
    }),
    align: field.choice({ label: 'Alignment', default: 'left', options: alignOptions }),
    font: field.choice({ label: 'Font', default: 'inherit', options: fontOptions }),
    color: field.color({ label: 'Color' }),
  },
  css: '.b-heading{margin:0;line-height:1.15;font-weight:650;letter-spacing:-0.02em;overflow-wrap:anywhere}',
  render(props) {
    const tag = props.level === 'h1' || props.level === 'h3' ? props.level : 'h2'
    const style = styleAttr({
      'font-size': sizes[tag],
      'text-align': props.align,
      'font-family': props.font === 'inherit' ? null : pick(fonts, props.font, 'inherit'),
      color: color(props.color),
    })
    return `<${tag} class="b-heading"${style}>${escapeHtml(props.text)}</${tag}>`
  },
})
