import { defineBlock } from '../block.ts'
import { field } from '../fields.ts'
import { escapeHtml } from '../html.ts'
import { pick, radius, radiusOptions, spacing, spacingOptions, styleAttr } from '../style.ts'

const shapes = { original: null, square: '1 / 1', landscape: '4 / 3', wide: '16 / 9' } as const

export const galleryBlock = defineBlock({
  type: 'gallery',
  label: 'Image gallery',
  description: 'A grid of images from the media library, with optional captions.',
  icon: 'Images',
  group: 'Media',
  fields: {
    items: field.list({
      label: 'Images',
      itemLabel: 'Image',
      min: 1,
      max: 24,
      item: {
        mediaId: field.media({ label: 'Image', accept: 'image' }),
        alt: field.text({ label: 'Alt text', max: 500, help: 'Leave empty to use the alt text saved in the media library.' }),
        caption: field.text({ label: 'Caption', max: 300 }),
      },
      default: [{ mediaId: null, alt: '', caption: '' }],
    }),
    columns: field.choice({
      label: 'Columns',
      default: '3',
      help: 'Phones show two columns.',
      options: [
        { value: '2', label: 'Two' },
        { value: '3', label: 'Three' },
        { value: '4', label: 'Four' },
      ],
    }),
    shape: field.choice({
      label: 'Shape',
      default: 'square',
      options: [
        { value: 'original', label: 'Original' },
        { value: 'square', label: 'Square' },
        { value: 'landscape', label: '4:3' },
        { value: 'wide', label: '16:9' },
      ],
    }),
    gap: field.choice({ label: 'Gap', default: 'sm', options: spacingOptions }),
    radius: field.choice({ label: 'Corners', default: 'sm', options: radiusOptions }),
    captions: field.toggle({ label: 'Show captions', default: true }),
    openFull: field.toggle({ label: 'Open full image on click', help: 'Each image opens on its own in a new tab.' }),
  },
  css: [
    '.b-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:start}',
    '.b-gallery-c2{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '.b-gallery-c4{grid-template-columns:repeat(4,minmax(0,1fr))}',
    '@media (max-width:640px){.b-gallery,.b-gallery-c4{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '.b-gallery figure{margin:0;display:flex;flex-direction:column;gap:6px;min-width:0}',
    '.b-gallery a{display:block}',
    '.b-gallery img{display:block;width:100%;height:auto;object-fit:cover}',
    '.b-gallery figcaption{font-size:.875rem;opacity:.75;overflow-wrap:anywhere}',
  ].join(''),
  render(props, context) {
    const aspect = props.shape in shapes ? shapes[props.shape as keyof typeof shapes] : shapes.square
    const figures = props.items
      .map((item) => {
        const media = context.media(item.mediaId)
        if (!media) return ''
        const alt = item.alt.trim() || media.alt || ''
        const image = `<img src="${escapeHtml(media.path)}" alt="${escapeHtml(alt)}"${media.width ? ` width="${media.width}"` : ''}${
          media.height ? ` height="${media.height}"` : ''
        } loading="lazy" decoding="async"${styleAttr({ 'aspect-ratio': aspect, 'border-radius': pick(radius, props.radius, 'sm') })}>`
        const linked = props.openFull ? `<a href="${escapeHtml(media.path)}" target="_blank" rel="noopener noreferrer">${image}</a>` : image
        const caption = props.captions && item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ''
        return `<figure>${linked}${caption}</figure>`
      })
      .join('')
    if (!figures) return ''
    const columns = props.columns === '2' || props.columns === '4' ? ` b-gallery-c${props.columns}` : ''
    return `<div class="b-gallery${columns}"${styleAttr({ gap: pick(spacing, props.gap, 'sm') })}>${figures}</div>`
  },
})
