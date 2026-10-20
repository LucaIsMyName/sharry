import { describe, expect, it } from 'vitest'
import { generatePassword } from './password.ts'

describe('password generator', () => {
  it('returns 16 characters covering each class and skips ambiguous letters', () => {
    const password = generatePassword()
    expect(password).toHaveLength(16)
    expect(password).toMatch(/[A-HJ-NP-Z]/)
    expect(password).toMatch(/[a-hj-km-np-z]/)
    expect(password).toMatch(/[2-9]/)
    expect(password).toMatch(/[!@#$%&*+\-=]/)
    expect(password).not.toMatch(/[0OIl1]/)
  })

  it('uses the supplied entropy and keeps at least 12 characters', () => {
    let step = 0
    const password = generatePassword(4, () => {
      step += 1
      return (step % 10) / 10
    })
    expect(password.length).toBeGreaterThanOrEqual(12)
    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[0-9]/)
    expect(password).toMatch(/[!@#$%&*+\-=]/)
  })
})
