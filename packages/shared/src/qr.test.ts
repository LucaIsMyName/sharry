import { describe, expect, it } from 'vitest'
import { defaultQrStyle, qrWarnings, renderQrSvg } from './qr.ts'

describe('qr svg', () => {
  it('renders vector path data', () => {
    const svg = renderQrSvg('https://share.example.com/s/abc123', defaultQrStyle)
    expect(svg.length).toBeGreaterThan(200)
    expect(svg).toContain('<path')
  })

  it('warns when a large logo is paired with low error correction', () => {
    const warnings = qrWarnings({ ...defaultQrStyle, imageSize: 0.4, errorCorrectionLevel: 'L' }, true)
    expect(warnings.length).toBeGreaterThan(0)
  })
})
