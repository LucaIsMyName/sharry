import { defineBlock } from '../block.ts'
import { field } from '../fields.ts'
import { escapeHtml, isSafeHref } from '../html.ts'
import { alignOptions, color, fontOptions, fonts, justify, pick, radius, radiusOptions, spacing, spacingOptions, styleAttr, textSizeOptions, textSizes } from '../style.ts'

export const buttonBlock = defineBlock({
  type: 'button',
  label: 'Button',
  description: 'A call to action that opens a web address or one of your short links.',
  icon: 'MousePointerClick',
  group: 'Content',
  fields: {
    label: field.text({ label: 'Label', max: 120, default: 'Learn more' }),
    href: field.url({ label: 'Link', shortLinks: true, placeholder: 'https://example.com' }),
    title: field.text({ label: 'Tooltip', max: 200, help: 'Shown when the pointer rests on the button.' }),
    newTab: field.toggle({ label: 'Open in a new tab' }),
    variant: field.choice({
      label: 'Style',
      default: 'solid',
      options: [
        { value: 'solid', label: 'Filled' },
        { value: 'outline', label: 'Outline' },
      ],
    }),
    background: field.color({ label: 'Button color', default: '#13119b' }),
    textColor: field.color({ label: 'Label color', default: '#ffffff' }),
    radius: field.choice({ label: 'Corners', default: 'sm', options: radiusOptions }),
    size: field.choice({ label: 'Text size', default: 'md', options: textSizeOptions }),
    font: field.choice({ label: 'Font', default: 'inherit', options: fontOptions }),
    width: field.choice({
      label: 'Width',
      default: 'inline',
      options: [
        { value: 'inline', label: 'Fit the label' },
        { value: 'full', label: 'Full width' },
      ],
    }),
    paddingInline: field.choice({ label: 'Space at the sides', default: 'md', options: spacingOptions }),
    paddingBlock: field.choice({ label: 'Space above and below', default: 'sm', options: spacingOptions }),
    align: field.choice({ label: 'Alignment', default: 'left', options: alignOptions }),
  },
  css: '.b-button-row{display:flex}.b-button{display:inline-block;box-sizing:border-box;text-align:center;text-decoration:none;font-weight:600;line-height:1.2;border:2px solid transparent}',
  render(props) {
    const fill = color(props.background) ?? '#13119b'
    const label = color(props.textColor) ?? '#ffffff'
    const outline = props.variant === 'outline'
    const style = styleAttr({
      'background-color': outline ? 'transparent' : fill,
      'border-color': fill,
      color: outline ? fill : label,
      'border-radius': pick(radius, props.radius, 'sm'),
      'font-size': pick(textSizes, props.size, 'md'),
      'font-family': props.font === 'inherit' ? null : pick(fonts, props.font, 'inherit'),
      padding: `${pick(spacing, props.paddingBlock, 'sm')} ${pick(spacing, props.paddingInline, 'md')}`,
      width: props.width === 'full' ? '100%' : null,
    })
    const href = isSafeHref(props.href) && props.href ? props.href : '#'
    const attributes = [
      `href="${escapeHtml(href)}"`,
      props.title ? `title="${escapeHtml(props.title)}"` : '',
      props.newTab ? 'target="_blank" rel="noopener noreferrer"' : '',
    ]
      .filter(Boolean)
      .join(' ')
    const row = styleAttr({ 'justify-content': justify[props.align] ?? 'flex-start' })
    return `<div class="b-button-row"${row}><a class="b-button" ${attributes}${style}>${escapeHtml(props.label)}</a></div>`
  },
})
