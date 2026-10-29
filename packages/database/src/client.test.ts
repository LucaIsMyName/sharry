import { describe, expect, it } from 'vitest'
import { poolConfig } from './client.ts'

describe('poolConfig', () => {
  it('leaves loopback and an explicit sslmode alone, and verifies other hosts', () => {
    expect(poolConfig('postgresql://sharry:sharry@127.0.0.1:5432/sharry').ssl).toBeUndefined()
    expect(poolConfig('postgresql://sharry:sharry@localhost:5432/sharry').ssl).toBeUndefined()
    expect(poolConfig('postgresql://sharry:sharry@[::1]:5432/sharry').ssl).toBeUndefined()
    expect(poolConfig('postgresql://sharry:sharry@db.example:5432/sharry').ssl).toEqual({ rejectUnauthorized: true })
    expect(poolConfig('postgresql://sharry:sharry@db.example:5432/sharry?sslmode=disable').ssl).toBeUndefined()
  })
})
