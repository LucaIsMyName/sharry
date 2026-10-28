import { defineBlock } from '../block.ts'
import { field } from '../fields.ts'
import { escapeHtml } from '../html.ts'
import { cleanRichText } from '../rich-text.ts'
import { color, pick, radius, radiusOptions, styleAttr } from '../style.ts'

export const accordionBlock = defineBlock({
  type: 'accordion',
  label: 'Accordion',
  description: 'Questions or sections that open when a visitor clicks them. Works without JavaScript.',
  icon: 'ListCollapse',
  group: 'Content',
  fields: {
    items: field.list({
      label: 'Items',
      itemLabel: 'Item',
      min: 1,
      max: 30,
      item: {
        headline: field.text({ label: 'Headline', max: 200, default: 'Question' }),
        html: field.richText({ label: 'Answer', default: '<p>Answer</p>' }),
      },
      default: [
        { headline: 'What is this?', html: '<p>Explain it in a sentence or two.</p>' },
        { headline: 'How do I start?', html: '<p>Describe the first step.</p>' },
      ],
    }),
    marker: field.choice({
      label: 'Marker',
      default: 'chevron',
      options: [
        { value: 'chevron', label: 'Arrow' },
        { value: 'plus', label: 'Plus' },
      ],
    }),
    openFirst: field.toggle({ label: 'Open the first item' }),
    radius: field.choice({ label: 'Corners', default: 'sm', options: radiusOptions }),
    background: field.color({ label: 'Background' }),
    textColor: field.color({ label: 'Text color' }),
    borderColor: field.color({ label: 'Lines', default: '#e4e4e7' }),
  },
  css: [
    '.b-accordion{display:flex;flex-direction:column;overflow:hidden}',
    '.b-accordion details+details{border-top:1px solid var(--line)}',
    '.b-accordion summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:16px;padding:16px;font-weight:600}',
    '.b-accordion summary::-webkit-details-marker{display:none}',
    '.b-accordion summary::after{content:"";flex:none;width:8px;height:8px;margin-top:6px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);transition:transform .15s}',
    '.b-accordion details[open] summary::after{transform:rotate(225deg)}',
    '.b-accordion.plus summary::after{content:"+";border:0;width:auto;height:auto;margin:0;transform:none;font-weight:400;font-size:1.25rem;line-height:1}',
    '.b-accordion.plus details[open] summary::after{content:"\\2212";transform:none}',
    '.b-accordion .b-answer{padding:0 16px 16px;line-height:1.65}.b-accordion .b-answer>:first-child{margin-top:0}.b-accordion .b-answer>:last-child{margin-bottom:0}',
  ].join(''),
  render(props) {
    const line = color(props.borderColor) ?? '#e4e4e7'
    const style = styleAttr({
      '--line': line,
      border: `1px solid ${line}`,
      'border-radius': pick(radius, props.radius, 'sm'),
      'background-color': color(props.background),
      color: color(props.textColor),
    })
    const items = props.items
      .map(
        (item, index) =>
          `<details${props.openFirst && index === 0 ? ' open' : ''}><summary>${escapeHtml(item.headline)}</summary><div class="b-answer">${cleanRichText(item.html)}</div></details>`,
      )
      .join('')
    return `<div class="b-accordion${props.marker === 'plus' ? ' plus' : ''}"${style}>${items}</div>`
  },
})
