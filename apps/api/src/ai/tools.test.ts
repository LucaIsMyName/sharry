import { describe, expect, it } from 'vitest'
import { analyticsSentence, blocksFromAnalyticsResult } from './tools.ts'

const result = { from: '2026-09-26', to: '2026-10-26', totalClicks: 4, uniqueVisitors: 2 }

describe('analyticsSentence', () => {
  it('explains the chart and the links table for the last 30 days', () => {
    const text = analyticsSentence('en', result, true, 'all')
    expect(text).toContain('Last 30 days (2026-09-26 to 2026-10-26)')
    expect(text).toContain('4 clicks, 2 unique visitors')
    expect(text).toContain('The chart shows clicks by day.')
    expect(text).toContain('The bars show referrers, countries, browsers, devices, operating systems, bots, and UTM fields.')
    expect(text).toContain('The table lists each link with its clicks and unique visitors.')
  })

  it('explains the bars when one link was chosen', () => {
    const text = analyticsSentence('en', result, false, 'link')
    expect(text).toContain('From 2026-09-26 to 2026-10-26')
    expect(text.endsWith('The bars show referrers, countries, browsers, devices, operating systems, bots, and UTM fields.')).toBe(true)
  })

  it('writes the same explanation in German', () => {
    const text = analyticsSentence('de', result, true, 'link')
    expect(text).toContain('Letzte 30 Tage (2026-09-26 bis 2026-10-26)')
    expect(text).toContain('Das Diagramm zeigt die Klicks pro Tag.')
    expect(text).toContain('Die Balken zeigen Verweise, Länder, Browser, Geräte, Betriebssysteme, Bots und UTM-Felder.')
  })
})

describe('analytics blocks', () => {
  it('keeps a browser bar and skips an empty country group', () => {
    const blocks = blocksFromAnalyticsResult({
      path: '/analytics?link=1',
      series: [{ date: '2026-10-01', clicks: 2 }],
      browsers: [{ name: 'Chrome', clicks: 2 }],
      countries: [],
      operatingSystems: [{ name: 'macOS', clicks: 2 }],
      bots: [
        { name: 'People', clicks: 2 },
        { name: 'Bots', clicks: 0 },
      ],
      utmSources: [{ name: 'newsletter', clicks: 2 }],
    })
    expect(blocks.filter((block) => block.type === 'bars').map((block) => block.title)).toEqual([
      'Browsers',
      'Operating systems',
      'Bots',
      'utm_source',
    ])
    expect(blocks.some((block) => block.type === 'table')).toBe(false)
  })

  it('keeps the links table beside the bars for all links', () => {
    const blocks = blocksFromAnalyticsResult({
      path: '/analytics',
      series: [{ date: '2026-10-01', clicks: 1 }],
      referrers: [{ name: 'Direct', clicks: 1 }],
      links: [{ title: 'Spring', slug: 'spring', clicks: 1, uniqueVisitors: 1 }],
    })
    expect(blocks.some((block) => block.type === 'bars' && block.title === 'Referrers')).toBe(true)
    expect(blocks.some((block) => block.type === 'table' && block.title === 'Links')).toBe(true)
  })
})
