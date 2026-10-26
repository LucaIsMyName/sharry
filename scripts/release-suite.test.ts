import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { suiteGate } from './release-suite.ts'

describe('release suite gate', () => {
  it('stops deploy when the suite fails or the csv is missing', () => {
    expect(() => suiteGate(1, '/missing.csv')).toThrow(/Deploy stopped before uploading/)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sharry-suite-'))
    const file = path.join(dir, 'test-results.csv')
    fs.writeFileSync(file, 'not a results file\n')
    expect(() => suiteGate(0, file)).toThrow(/without writing/)
    fs.writeFileSync(file, '# ran_at=2026-10-26T00:00:00.000Z\nfile,passed,failed,skipped,duration_ms\n"a.test.ts",1,0,0,2\n')
    expect(() => suiteGate(0, file)).not.toThrow()
  })
})
