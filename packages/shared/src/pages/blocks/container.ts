import { defineBlock } from '../block.ts'
import { field } from '../fields.ts'
import { anchorId } from '../html.ts'
import { color, cssUrl, pick, radius, radiusOptions, rgba, spacing, spacingOptions, styleAttr } from '../style.ts'

const widths = { sm: '640px', md: '860px', lg: '1100px', full: 'none' } as const
const heights = { auto: null, sm: '240px', md: '400px', lg: '600px', screen: '100vh' } as const
const positions = { top: null, center: 'center', bottom: 'flex-end', between: 'space-between' } as const
const alignments = { stretch: null, left: 'flex-start', center: 'center', right: 'flex-end' } as const
const shadows = { none: null, soft: '0 4px 16px rgba(0,0,0,.08)', strong: '0 12px 32px rgba(0,0,0,.18)' } as const
const overlays = { none: 0, light: 0.3, medium: 0.5, strong: 0.7 } as const

function lookup<T extends Record<string, string | number | null>>(scale: T, key: string): T[keyof T] | null {
  return key in scale ? (scale[key as keyof T] ?? null) : null
}

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
    minHeight: field.choice({
      label: 'Minimum height',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'sm', label: 'Small' },
        { value: 'md', label: 'Medium' },
        { value: 'lg', label: 'Large' },
        { value: 'screen', label: 'Full screen' },
      ],
    }),
    justify: field.choice({
      label: 'Vertical position',
      default: 'top',
      help: 'Where the content sits when the section is taller than its content.',
      options: [
        { value: 'top', label: 'Top' },
        { value: 'center', label: 'Center' },
        { value: 'bottom', label: 'Bottom' },
        { value: 'between', label: 'Spread out' },
      ],
    }),
    align: field.choice({
      label: 'Horizontal alignment',
      default: 'stretch',
      options: [
        { value: 'stretch', label: 'Stretch' },
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
        { value: 'right', label: 'Right' },
      ],
    }),
    paddingBlock: field.choice({ label: 'Space above and below', default: 'lg', options: spacingOptions }),
    paddingInline: field.choice({ label: 'Space at the sides', default: 'md', options: spacingOptions }),
    marginBlock: field.choice({ label: 'Outer space', default: 'none', options: spacingOptions }),
    radius: field.choice({ label: 'Corners', default: 'none', options: radiusOptions }),
    background: field.color({ label: 'Background' }),
    textColor: field.color({ label: 'Text color' }),
    borderColor: field.color({ label: 'Border', help: 'Leave empty for no border.' }),
    shadow: field.choice({
      label: 'Shadow',
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'soft', label: 'Soft' },
        { value: 'strong', label: 'Strong' },
      ],
    }),
    backgroundImageId: field.media({ label: 'Background image', accept: 'image' }),
    overlayColor: field.color({ label: 'Overlay color', default: '#000000' }),
    overlayOpacity: field.choice({
      label: 'Overlay',
      default: 'none',
      help: 'Darkens or tints the background image so text stays readable.',
      options: [
        { value: 'none', label: 'None' },
        { value: 'light', label: 'Light' },
        { value: 'medium', label: 'Medium' },
        { value: 'strong', label: 'Strong' },
      ],
    }),
    anchor: field.text({
      label: 'Anchor',
      max: 40,
      placeholder: 'prices',
      help: 'Buttons can link here with #name. Use letters, digits, and hyphens.',
    }),
  },
  css: '.b-container{box-sizing:border-box;display:flex;flex-direction:column}.b-container>.b-inner{width:100%;margin:0 auto;display:flex;flex-direction:column;gap:16px}',
  render(props, context, slots) {
    const image = context.media(props.backgroundImageId)
    const opacity = lookup(overlays, props.overlayOpacity) ?? 0
    const overlay = opacity > 0 ? rgba(props.overlayColor, opacity) : null
    const border = color(props.borderColor)
    const outer = styleAttr({
      'background-color': color(props.background),
      color: color(props.textColor),
      padding: `${pick(spacing, props.paddingBlock, 'lg')} ${pick(spacing, props.paddingInline, 'md')}`,
      margin: `${pick(spacing, props.marginBlock, 'none')} 0`,
      'border-radius': pick(radius, props.radius, 'none'),
      'min-height': lookup(heights, props.minHeight),
      'justify-content': lookup(positions, props.justify),
      border: border ? `1px solid ${border}` : null,
      'box-shadow': lookup(shadows, props.shadow),
      'background-image': image ? [overlay ? `linear-gradient(${overlay},${overlay})` : null, cssUrl(image.path)].filter(Boolean).join(',') : null,
      'background-size': image ? 'cover' : null,
      'background-position': image ? 'center' : null,
    })
    const inner = styleAttr({ 'max-width': pick(widths, props.width, 'md'), 'align-items': lookup(alignments, props.align) })
    const id = anchorId(props.anchor)
    return `<section class="b-container"${id ? ` id="${id}"` : ''}${outer}><div class="b-inner"${inner}>${slots.children ?? ''}</div></section>`
  },
})
