import { describe, expect, it } from 'vitest'
import { isTagColor, randomTagColor, tagPalette, tagTextColor } from './tags.ts'

describe('tag colors', () => {
  it('picks a palette color and a readable text color', () => {
    expect(tagPalette).toContain(randomTagColor())
    expect(isTagColor('#7c6af7')).toBe(true)
    expect(isTagColor('purple')).toBe(false)
    expect(tagTextColor('#e9a825')).toBe('#1a1814')
    expect(tagTextColor('#7c6af7')).toBe('#ffffff')
  })
})
