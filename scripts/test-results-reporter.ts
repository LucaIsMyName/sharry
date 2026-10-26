import fs from 'node:fs'
import path from 'node:path'
import type { Reporter, TestModule } from 'vitest/node'
import {
  formatTestResults,
  summarizeFile,
  type CountedTestState,
  type TestFileResult,
} from '../apps/web/src/pages/test-results.ts'

const outputPath = path.resolve(process.cwd(), 'apps/web/public/test-results.csv')

export default class TestResultsReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const files = testModules
      .map((testModule) => fileResult(testModule))
      .sort((left, right) => left.file.localeCompare(right.file))
    const csv = formatTestResults({
      ranAt: new Date().toISOString(),
      files,
    })
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, csv)
  }
}

function fileResult(testModule: TestModule): TestFileResult {
  const tests: CountedTestState[] = [...testModule.children.allTests()].map((test) => {
    const state = test.result().state
    if (state === 'passed' || state === 'failed' || state === 'skipped') return state
    return 'pending'
  })
  return summarizeFile({
    file: relativeFile(testModule.moduleId),
    durationMs: testModule.diagnostic().duration,
    tests,
    moduleFailed: testModule.state() === 'failed' && tests.length === 0,
  })
}

function relativeFile(moduleId: string): string {
  const absolute = path.isAbsolute(moduleId) ? moduleId : path.resolve(moduleId)
  return path.relative(process.cwd(), absolute).split(path.sep).join('/')
}
