import { defineBlock } from '../block.ts'
import { field } from '../fields.ts'
import { alignOptions, justify, pick, radiusOptions, spacing, spacingOptions, styleAttr, textSizeOptions } from '../style.ts'
import { buttonCss, buttonHtml } from './button.ts'

export const buttonGroupBlock = defineBlock({
  type: 'buttons',
  label: 'Button group',
  description: 'Several buttons side by side, such as a main and a second call to action.',
  icon: 'RectangleHorizontal',
  group: 'Content',
  fields: {
    items: field.list({
      label: 'Buttons',
      itemLabel: 'Button',
      min: 1,
      max: 4,
      item: {
        label: field.text({ label: 'Label', max: 120, default: 'Learn more' }),
        href: field.url({ label: 'Link', shortLinks: true, placeholder: 'https://example.com' }),
        variant: field.choice({
          label: 'Style',
          default: 'solid',
          options: [
            { value: 'solid', label: 'Filled' },
            { value: 'outline', label: 'Outline' },
          ],
        }),
        newTab: field.toggle({ label: 'Open in a new tab' }),
      },
      default: [
        { label: 'Get started', href: '', variant: 'solid', newTab: false },
        { label: 'Learn more', href: '', variant: 'outline', newTab: false },
      ],
    }),
    background: field.color({ label: 'Button color', default: '#13119b' }),
    textColor: field.color({ label: 'Label color', default: '#ffffff' }),
    radius: field.choice({ label: 'Corners', default: 'sm', options: radiusOptions }),
    size: field.choice({ label: 'Text size', default: 'md', options: textSizeOptions }),
    gap: field.choice({ label: 'Gap', default: 'sm', options: spacingOptions }),
    align: field.choice({ label: 'Alignment', default: 'left', options: alignOptions }),
    stack: field.toggle({ label: 'Stack on phones', help: 'Buttons fill the width one below the other on small screens.' }),
  },
  css: `${buttonCss}.b-buttons{display:flex;flex-wrap:wrap}.b-buttons .b-button{padding:16px 32px}@media (max-width:640px){.b-buttons-stack{flex-direction:column;align-items:stretch}}`,
  render(props) {
    const style = styleAttr({ gap: pick(spacing, props.gap, 'sm'), 'justify-content': justify[props.align] ?? 'flex-start' })
    const buttons = props.items
      .map((item) =>
        buttonHtml({
          ...item,
          background: props.background,
          textColor: props.textColor,
          radius: props.radius,
          size: props.size,
        }),
      )
      .join('')
    return `<div class="b-buttons${props.stack ? ' b-buttons-stack' : ''}"${style}>${buttons}</div>`
  },
})
