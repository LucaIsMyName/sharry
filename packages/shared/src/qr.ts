import QRCode from 'qrcode'
import { z } from 'zod'

export const qrDots = ['square', 'rounded', 'dots', 'extra-rounded'] as const
export const qrCorners = ['square', 'rounded', 'dot', 'extra-rounded'] as const
export const qrCornerDots = ['square', 'dot'] as const
export const qrEcc = ['L', 'M', 'Q', 'H'] as const

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const qrStyleSchema = z.object({
  size: z.number().int().min(256).max(2048).default(512),
  margin: z.number().int().min(0).max(16).default(2),
  dotsType: z.enum(qrDots).default('rounded'),
  dotsColor: color.default('#1a1814'),
  cornersSquareType: z.enum(qrCorners).default('extra-rounded'),
  cornersSquareColor: color.default('#1a1814'),
  cornersDotType: z.enum(qrCornerDots).default('dot'),
  cornersDotColor: color.default('#0c6b4d'),
  backgroundColor: color.default('#ffffff'),
  backgroundTransparent: z.boolean().default(false),
  errorCorrectionLevel: z.enum(qrEcc).default('H'),
  imageSize: z.number().min(0).max(0.45).default(0.28),
  jpegBackground: color.default('#ffffff'),
})

export type QrStyle = {
  size: number
  margin: number
  dotsType: (typeof qrDots)[number]
  dotsColor: string
  cornersSquareType: (typeof qrCorners)[number]
  cornersSquareColor: string
  cornersDotType: (typeof qrCornerDots)[number]
  cornersDotColor: string
  backgroundColor: string
  backgroundTransparent: boolean
  errorCorrectionLevel: (typeof qrEcc)[number]
  imageSize: number
  jpegBackground: string
}

export function parseQrStyle(value: unknown): QrStyle {
  const parsed = qrStyleSchema.parse(value)
  return {
    size: parsed.size ?? 512,
    margin: parsed.margin ?? 2,
    dotsType: parsed.dotsType ?? 'rounded',
    dotsColor: parsed.dotsColor ?? '#1a1814',
    cornersSquareType: parsed.cornersSquareType ?? 'extra-rounded',
    cornersSquareColor: parsed.cornersSquareColor ?? '#1a1814',
    cornersDotType: parsed.cornersDotType ?? 'dot',
    cornersDotColor: parsed.cornersDotColor ?? '#0c6b4d',
    backgroundColor: parsed.backgroundColor ?? '#ffffff',
    backgroundTransparent: parsed.backgroundTransparent ?? false,
    errorCorrectionLevel: parsed.errorCorrectionLevel ?? 'H',
    imageSize: parsed.imageSize ?? 0.28,
    jpegBackground: parsed.jpegBackground ?? '#ffffff',
  }
}

export const defaultQrStyle: QrStyle = parseQrStyle({})

export function qrWarnings(style: QrStyle, hasLogo: boolean): string[] {
  const warnings: string[] = []
  const background = style.backgroundTransparent ? '#ffffff' : style.backgroundColor
  if (contrastRatio(style.dotsColor, background) < 3) {
    warnings.push('The foreground and background are too similar to scan reliably.')
  }
  if (hasLogo && style.imageSize > 0.3) {
    warnings.push('The center image is large and may make the code hard to scan.')
  }
  if (hasLogo && style.errorCorrectionLevel !== 'H') {
    warnings.push('Use high error correction when a center image is shown.')
  }
  if (style.margin < 2) {
    warnings.push('Increase the quiet zone so scanners can find the code.')
  }
  if (style.backgroundTransparent) {
    warnings.push('Transparent backgrounds fail on dark surfaces. Test before printing.')
  }
  return warnings
}

export function renderQrSvg(value: string, style: QrStyle, imageHref?: string | null): string {
  const qr = QRCode.create(value, { errorCorrectionLevel: style.errorCorrectionLevel })
  const modules = qr.modules
  const count = modules.size
  const quiet = style.margin
  const cells = count + quiet * 2
  const cell = style.size / cells
  const paths: string[] = []
  const finders = [
    [0, 0],
    [count - 7, 0],
    [0, count - 7],
  ] as const

  for (let y = 0; y < count; y += 1) {
    for (let x = 0; x < count; x += 1) {
      if (!modules.get(y, x)) continue
      if (finders.some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7)) continue
      const px = (x + quiet) * cell
      const py = (y + quiet) * cell
      paths.push(modulePath(style.dotsType, px, py, cell))
    }
  }

  const finderMarkup = finders
    .map(([x, y]) => finderMarkupAt(style, (x + quiet) * cell, (y + quiet) * cell, cell))
    .join('')

  const background = style.backgroundTransparent
    ? ''
    : `<rect width="${style.size}" height="${style.size}" fill="${style.backgroundColor}"/>`
  const logo =
    imageHref && style.imageSize > 0 ? logoMarkup(style, imageHref) : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${style.size}" height="${style.size}" viewBox="0 0 ${style.size} ${style.size}" shape-rendering="geometricPrecision">
${background}
<path fill="${style.dotsColor}" d="${paths.join(' ')}"/>
${finderMarkup}
${logo}
</svg>`
}

function logoMarkup(style: QrStyle, href: string): string {
  if (!/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(href)) return ''
  const imagePx = style.size * style.imageSize
  const pad = imagePx * 0.18
  const box = imagePx + pad
  const x = (style.size - box) / 2
  const y = (style.size - box) / 2
  const fill = style.backgroundTransparent ? style.jpegBackground : style.backgroundColor
  return `<rect x="${x}" y="${y}" width="${box}" height="${box}" rx="${box * 0.18}" fill="${fill}"/>
<image href="${href}" x="${x + pad / 2}" y="${y + pad / 2}" width="${imagePx}" height="${imagePx}" preserveAspectRatio="xMidYMid meet"/>`
}

function finderMarkupAt(style: QrStyle, x: number, y: number, cell: number): string {
  const outer = 7 * cell
  const mid = 5 * cell
  const inner = 3 * cell
  const midOffset = cell
  const innerOffset = 2 * cell
  const background = style.backgroundTransparent ? '#ffffff' : style.backgroundColor
  const outerRadius = finderRadius(style.cornersSquareType, outer)
  const midRadius = finderRadius(style.cornersSquareType, mid)
  const innerRadius = style.cornersDotType === 'dot' ? inner / 2 : inner * 0.2
  return `<path fill="${style.cornersSquareColor}" d="${roundRect(x, y, outer, outerRadius)}"/>
<path fill="${background}" d="${roundRect(x + midOffset, y + midOffset, mid, midRadius)}"/>
<path fill="${style.cornersDotColor}" d="${roundRect(x + innerOffset, y + innerOffset, inner, innerRadius)}"/>`
}

function finderRadius(type: QrStyle['cornersSquareType'], size: number): number {
  if (type === 'dot' || type === 'extra-rounded') return size / 2
  if (type === 'rounded') return size * 0.22
  return 0
}

function modulePath(type: QrStyle['dotsType'], x: number, y: number, cell: number): string {
  const inset = cell * 0.08
  const size = cell - inset * 2
  if (type === 'dots' || type === 'extra-rounded') return circlePath(x + cell / 2, y + cell / 2, size / 2)
  if (type === 'rounded') return roundRect(x + inset, y + inset, size, size * 0.35)
  return roundRect(x, y, cell, 0)
}

function circlePath(cx: number, cy: number, radius: number): string {
  return `M ${cx - radius} ${cy} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`
}

function roundRect(x: number, y: number, size: number, radius: number): string {
  const r = Math.min(radius, size / 2)
  if (r <= 0) return `M ${x} ${y} h ${size} v ${size} h ${-size} z`
  return `M ${x + r} ${y} h ${size - r * 2} a ${r} ${r} 0 0 1 ${r} ${r} v ${size - r * 2} a ${r} ${r} 0 0 1 ${-r} ${r} h ${-(size - r * 2)} a ${r} ${r} 0 0 1 ${-r} ${-r} v ${-(size - r * 2)} a ${r} ${r} 0 0 1 ${r} ${-r} z`
}

function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground)
  const l2 = relativeLuminance(background)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function relativeLuminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0)
}
