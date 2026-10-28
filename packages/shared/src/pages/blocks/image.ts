import { defineBlock } from '../block.ts'
import { field } from '../fields.ts'
import { escapeHtml, isSafeHref } from '../html.ts'
import { alignOptions, color, justify, pick, radius, radiusOptions, spacing, spacingOptions, styleAttr } from '../style.ts'

const widths = { auto: null, sm: '320px', md: '560px', full: '100%' } as const
const filters = {
  none: null,
  grayscale: 'grayscale(1)',
  contrast: 'contrast(1.25)',
  sepia: 'sepia(0.8)',
  blur: 'blur(3px)',
  brightness: 'brightness(1.15)',
} as const

export const imageBlock = defineBlock({
  type: 'image',
  label: 'Image',
  description: 'An image from the media library, with a caption, frame, and filter.',
  icon: 'Image',
  group: 'Media',
  fields: {
    mediaId: field.media({ label: 'Image', accept: 'image' }),
    alt: field.text({
      label: 'Alt text',
      max: 500,
      help: 'Leave empty to use the alt text saved in the media library.',
    }),
    caption: field.text({ label: 'Caption', max: 300 }),
    href: field.url({ label: 'Link', shortLinks: true, help: 'Optional. The image opens this address.' }),
    width: field.choice({
      label: 'Width',
      default: 'full',
      options: [
        { value: 'auto', label: 'Original size' },
        { value: 'sm', label: 'Small' },
        { value: 'md', label: 'Medium' },
        { value: 'full', label: 'Full width' },
      ],
    }),
    align: field.choice({ label: 'Alignment', default: 'center', options: alignOptions }),
    radius: field.choice({ label: 'Corners', default: 'none', options: radiusOptions }),
    borderColor: field.color({ label: 'Border', help: 'Leave empty for no border.' }),
    paddingInline: field.choice({ label: 'Space at the sides', default: 'none', options: spacingOptions }),
    paddingBlock: field.choice({ label: 'Space above and below', default: 'none', options: spacingOptions }),
    filter: field.choice({
      label: 'Filter',
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'grayscale', label: 'Black and white' },
        { value: 'contrast', label: 'More contrast' },
        { value: 'sepia', label: 'Sepia' },
        { value: 'blur', label: 'Blur' },
        { value: 'brightness', label: 'Brighter' },
      ],
    }),
  },
  css: '.b-image{margin:0;display:flex;flex-direction:column;gap:8px}.b-image img{display:block;max-width:100%;height:auto;box-sizing:border-box}.b-image figcaption{font-size:.875rem;opacity:.75}',
  render(props, context) {
    const media = context.media(props.mediaId)
    if (!media) return ''
    const alt = props.alt.trim() || media.alt || ''
    const border = color(props.borderColor)
    const image = `<img src="${escapeHtml(media.path)}" alt="${escapeHtml(alt)}"${media.width ? ` width="${media.width}"` : ''}${
      media.height ? ` height="${media.height}"` : ''
    } loading="lazy" decoding="async"${styleAttr({
      width: (widths as Record<string, string | null>)[props.width] ?? '100%',
      'border-radius': pick(radius, props.radius, 'none'),
      border: border ? `1px solid ${border}` : null,
      filter: (filters as Record<string, string | null>)[props.filter] ?? null,
    })}>`
    const linked = props.href && isSafeHref(props.href) ? `<a href="${escapeHtml(props.href)}">${image}</a>` : image
    const caption = props.caption ? `<figcaption>${escapeHtml(props.caption)}</figcaption>` : ''
    const style = styleAttr({
      'align-items': justify[props.align] ?? 'center',
      padding: `${pick(spacing, props.paddingBlock, 'none')} ${pick(spacing, props.paddingInline, 'none')}`,
    })
    return `<figure class="b-image"${style}>${linked}${caption}</figure>`
  },
})
