import { describe, expect, it } from 'vitest'
import { analyticsSentence } from './tools.ts'

const result = { from: '2026-09-26', to: '2026-10-26', totalClicks: 4, uniqueVisitors: 2 }

describe('analyticsSentence', () => {
  it('explains the chart and the links table for the last 30 days', () => {
    const text = analyticsSentence('en', result, true, 'all')
    expect(text).toContain('Last 30 days (2026-09-26 to 2026-10-26)')
    expect(text).toContain('4 clicks, 2 unique visitors')
    expect(text).toContain('The chart shows clicks by day.')
    expect(text).toContain('The table lists each link with its clicks and unique visitors.')
  })

  it('explains a referrer table when one link was chosen', () => {
    const text = analyticsSentence('en', result, false, 'link')
    expect(text).toContain('From 2026-09-26 to 2026-10-26')
    expect(text).toContain('The table lists referrers.')
  })

  it('writes the same explanation in German', () => {
    const text = analyticsSentence('de', result, true, 'link')
    expect(text).toContain('Letzte 30 Tage (2026-09-26 bis 2026-10-26)')
    expect(text).toContain('Das Diagramm zeigt die Klicks pro Tag.')
    expect(text).toContain('Die Tabelle listet die Verweise.')
  })
})
