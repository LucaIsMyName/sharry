import { describe, expect, it } from 'vitest'
import { defaultQrStyle, parseQrStyle, qrWarnings, renderQrSvg } from './qr.ts'

describe('qr svg', () => {
  it('renders vector path data', () => {
    const svg = renderQrSvg('https://share.example.com/s/abc123', defaultQrStyle)
    expect(svg.length).toBeGreaterThan(200)
    expect(svg).toContain('<path')
    expect(svg).not.toContain('#0c6b4d')
    expect(svg).toContain(defaultQrStyle.dotsColor)
  })

  it('renders a corner dot color that differs from the foreground', () => {
    const style = parseQrStyle({ dotsColor: '#112233', cornersDotColor: '#abcdef' })
    expect(style.cornersDotColor).toBe('#abcdef')
    const svg = renderQrSvg('https://share.example.com/s/abc123', style)
    expect(svg).toContain('#abcdef')
    expect(svg).toContain('#112233')
  })

  it('warns when a large logo is paired with low error correction', () => {
    const warnings = qrWarnings({ ...defaultQrStyle, imageSize: 0.4, errorCorrectionLevel: 'L' }, true)
    expect(warnings.length).toBeGreaterThan(0)
  })
})
