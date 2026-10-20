import { describe, expect, it } from 'vitest'
import { allocateRandomSlug, validatePrefix, validateSlug } from './prefix.ts'

describe('slugs and prefixes', () => {
  it('rejects reserved prefixes', () => {
    expect(validatePrefix('/api')).toMatch(/conflicts/)
    expect(validatePrefix('/docs')).toMatch(/conflicts/)
    expect(validatePrefix('/s')).toBeNull()
    expect(validatePrefix('s')).toMatch(/start/)
  })

  it('retries a colliding random slug and then fails cleanly', async () => {
    let attempts = 0
    const slug = await allocateRandomSlug(
      5,
      async () => {
        attempts += 1
        return attempts === 1
      },
      () => 0.2,
      4,
    )
    expect(slug).toHaveLength(5)
    expect(attempts).toBe(2)

    await expect(allocateRandomSlug(5, async () => true, () => 0.2, 3)).rejects.toThrow(/unique slug/)
  })

  it('rejects reserved slugs', () => {
    expect(validateSlug('admin')).toMatch(/reserved/)
    expect(validateSlug('docs')).toMatch(/reserved/)
    expect(validateSlug('summer-sale')).toBeNull()
  })
})
