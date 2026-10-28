import { defineBlock } from '../block.ts'
import { field } from '../fields.ts'
import { cleanRichText } from '../rich-text.ts'
import { alignOptions, color, fontOptions, fonts, pick, styleAttr, textSizeOptions, textSizes } from '../style.ts'

export const textBlock = defineBlock({
  type: 'text',
  label: 'Text',
  description: 'Formatted text with bold, italic, links, lists, and subheadings.',
  icon: 'Type',
  group: 'Content',
  fields: {
    html: field.richText({ label: 'Text', default: '<p>Write something here.</p>' }),
    size: field.choice({ label: 'Size', default: 'md', options: textSizeOptions }),
    align: field.choice({ label: 'Alignment', default: 'left', options: alignOptions }),
    font: field.choice({ label: 'Font', default: 'inherit', options: fontOptions }),
    color: field.color({ label: 'Color' }),
  },
  css:
    '.b-text{line-height:1.65;overflow-wrap:anywhere}.b-text>:first-child{margin-top:0}.b-text>:last-child{margin-bottom:0}.b-text a{color:inherit;text-decoration:underline}.b-text blockquote{margin:0;padding-left:16px;border-left:3px solid currentColor;opacity:.85}',
  render(props) {
    const style = styleAttr({
      'font-size': pick(textSizes, props.size, 'md'),
      'text-align': props.align,
      'font-family': props.font === 'inherit' ? null : pick(fonts, props.font, 'inherit'),
      color: color(props.color),
    })
    return `<div class="b-text"${style}>${cleanRichText(props.html)}</div>`
  },
})
