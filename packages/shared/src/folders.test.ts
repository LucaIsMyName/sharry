import { describe, expect, it } from 'vitest'
import { folderParentCycles } from './folders.ts'

describe('folderParentCycles', () => {
  const parents = new Map<string, string | null>([
    ['root-folder', null],
    ['child', 'root-folder'],
    ['grandchild', 'child'],
  ])

  it('allows a move to root or to a folder outside the branch', () => {
    expect(folderParentCycles('child', null, parents)).toBe(false)
    expect(folderParentCycles('grandchild', 'root-folder', parents)).toBe(false)
  })

  it('rejects a move onto itself or a descendant', () => {
    expect(folderParentCycles('child', 'child', parents)).toBe(true)
    expect(folderParentCycles('root-folder', 'grandchild', parents)).toBe(true)
  })
})
