import { defineBlock } from '../block.ts'
import { field } from '../fields.ts'
import { escapeHtml } from '../html.ts'
import { pick, radius, radiusOptions, styleAttr } from '../style.ts'

export const videoBlock = defineBlock({
  type: 'video',
  label: 'Video',
  description: 'An MP4 or WebM video from the media library.',
  icon: 'Video',
  group: 'Media',
  fields: {
    mediaId: field.media({ label: 'Video', accept: 'video' }),
    posterId: field.media({ label: 'Cover image', accept: 'image', help: 'Shown before the video plays.' }),
    controls: field.toggle({ label: 'Show controls', default: true }),
    ambient: field.toggle({ label: 'Play muted on a loop', help: 'Starts by itself without sound, like a moving picture.' }),
    radius: field.choice({ label: 'Corners', default: 'none', options: radiusOptions }),
  },
  css: '.b-video{display:block;width:100%;height:auto;background:#000}',
  render(props, context) {
    const media = context.media(props.mediaId)
    if (!media) return ''
    const poster = context.media(props.posterId)
    const flags = [props.controls ? 'controls' : '', props.ambient ? 'autoplay muted loop playsinline' : '']
      .filter(Boolean)
      .join(' ')
    return `<video class="b-video" src="${escapeHtml(media.path)}"${poster ? ` poster="${escapeHtml(poster.path)}"` : ''} preload="metadata"${
      flags ? ` ${flags}` : ''
    }${styleAttr({ 'border-radius': pick(radius, props.radius, 'none') })}></video>`
  },
})
