import { describe, expect, it } from 'vitest'
import { defaultQrStyle, qrWarnings, renderQrSvg } from './qr.ts'

describe('qr svg', () => {
  it('renders vector path data', () => {
    const svg = renderQrSvg('https://share.example.com/s/abc123', defaultQrStyle)
    expect(svg.length).toBeGreaterThan(200)
    expect(svg).toContain('<path')
    expect(svg).not.toContain('#0c6b4d')
    expect(svg).toContain(defaultQrStyle.dotsColor)
  })

  it('warns when a large logo is paired with low error correction', () => {
    const warnings = qrWarnings({ ...defaultQrStyle, imageSize: 0.4, errorCorrectionLevel: 'L' }, true)
    expect(warnings.length).toBeGreaterThan(0)
  })
})
