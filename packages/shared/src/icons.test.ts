import { describe, expect, it } from 'vitest'
import { ICON_NAMES, defaultCampaignIcon, defaultFolderIcon, defaultLinkIcon, isIconName } from './icons.ts'

describe('icons', () => {
  it('accepts the curated names and rejects anything else', () => {
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(40)
    expect(isIconName(defaultLinkIcon)).toBe(true)
    expect(isIconName(defaultFolderIcon)).toBe(true)
    expect(isIconName(defaultCampaignIcon)).toBe(true)
    expect(isIconName('NotAnIcon')).toBe(false)
    expect(isIconName(null)).toBe(false)
  })
})
