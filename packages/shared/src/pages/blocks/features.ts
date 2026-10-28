import { defineBlock } from '../block.ts'
import { field } from '../fields.ts'
import { escapeHtml } from '../html.ts'
import { cleanRichText } from '../rich-text.ts'
import { alignOptions, color, pick, radius, radiusOptions, spacing, spacingOptions, styleAttr } from '../style.ts'

const columnCounts = ['2', '3', '4'] as const

export const featuresBlock = defineBlock({
  type: 'features',
  label: 'Feature grid',
  description: 'Cards in two to four columns, each with an optional image, a title, and text.',
  icon: 'LayoutGrid',
  group: 'Content',
  fields: {
    items: field.list({
      label: 'Features',
      itemLabel: 'Feature',
      min: 1,
      max: 12,
      item: {
        mediaId: field.media({ label: 'Image', accept: 'image' }),
        title: field.text({ label: 'Title', max: 200, default: 'Feature' }),
        html: field.richText({ label: 'Text', default: '<p>Describe it in a sentence.</p>' }),
      },
      default: [
        { mediaId: null, title: 'Fast', html: '<p>Explain the first benefit in a sentence.</p>' },
        { mediaId: null, title: 'Simple', html: '<p>Explain the second benefit in a sentence.</p>' },
        { mediaId: null, title: 'Reliable', html: '<p>Explain the third benefit in a sentence.</p>' },
      ],
    }),
    columns: field.choice({
      label: 'Columns',
      default: '3',
      help: 'Phones always show one column.',
      options: [
        { value: '2', label: 'Two' },
        { value: '3', label: 'Three' },
        { value: '4', label: 'Four' },
      ],
    }),
    imageSize: field.choice({
      label: 'Image size',
      default: 'icon',
      options: [
        { value: 'icon', label: 'Small icon' },
        { value: 'full', label: 'Full width' },
      ],
    }),
    cardStyle: field.choice({
      label: 'Card style',
      default: 'plain',
      options: [
        { value: 'plain', label: 'Plain' },
        { value: 'bordered', label: 'Bordered' },
        { value: 'filled', label: 'Filled' },
      ],
    }),
    cardColor: field.color({ label: 'Card color', default: '#f4f4f5', help: 'The background of filled cards and the line around bordered cards.' }),
    radius: field.choice({ label: 'Corners', default: 'md', options: radiusOptions }),
    gap: field.choice({ label: 'Gap', default: 'md', options: spacingOptions }),
    align: field.choice({ label: 'Alignment', default: 'left', options: alignOptions }),
  },
  css: [
    '.b-features{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}',
    '.b-features-c2{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '.b-features-c4{grid-template-columns:repeat(4,minmax(0,1fr))}',
    '@media (max-width:640px){.b-features,.b-features-c2,.b-features-c4{grid-template-columns:minmax(0,1fr)}}',
    '.b-feature{display:flex;flex-direction:column;gap:8px;min-width:0;box-sizing:border-box;overflow:hidden}',
    '.b-feature h3{margin:0;font-size:1.125rem;line-height:1.3;overflow-wrap:anywhere}',
    '.b-feature-text{line-height:1.6;overflow-wrap:anywhere}.b-feature-text>:first-child{margin-top:0}.b-feature-text>:last-child{margin-bottom:0}.b-feature-text a{color:inherit}',
    '.b-feature-icon{width:48px;height:48px;object-fit:contain}.b-feature-image{width:100%;height:auto;display:block}',
  ].join(''),
  render(props, context) {
    const columns = (columnCounts as readonly string[]).includes(props.columns) ? props.columns : '3'
    const cardColor = color(props.cardColor) ?? '#f4f4f5'
    const framed = props.cardStyle === 'bordered' || props.cardStyle === 'filled'
    const cardStyle = styleAttr({
      'text-align': props.align,
      padding: framed ? '24px' : null,
      'border-radius': framed ? pick(radius, props.radius, 'md') : null,
      'background-color': props.cardStyle === 'filled' ? cardColor : null,
      border: props.cardStyle === 'bordered' ? `1px solid ${cardColor}` : null,
      'align-items': props.align === 'center' ? 'center' : props.align === 'right' ? 'flex-end' : null,
    })
    const cards = props.items
      .map((item) => {
        const media = context.media(item.mediaId)
        const imageClass = props.imageSize === 'full' ? 'b-feature-image' : 'b-feature-icon'
        const image = media
          ? `<img class="${imageClass}" src="${escapeHtml(media.path)}" alt="${escapeHtml(media.alt ?? '')}" loading="lazy" decoding="async"${styleAttr({
              'border-radius': props.imageSize === 'full' ? pick(radius, props.radius, 'md') : null,
            })}>`
          : ''
        const title = item.title ? `<h3>${escapeHtml(item.title)}</h3>` : ''
        return `<div class="b-feature"${cardStyle}>${image}${title}<div class="b-feature-text">${cleanRichText(item.html)}</div></div>`
      })
      .join('')
    const grid = styleAttr({ gap: pick(spacing, props.gap, 'md') })
    return `<div class="b-features${columns === '3' ? '' : ` b-features-c${columns}`}"${grid}>${cards}</div>`
  },
})
