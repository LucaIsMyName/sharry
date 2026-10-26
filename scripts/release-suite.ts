import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

export const testResultsCsv = 'apps/web/public/test-results.csv'

const header = 'file,passed,failed,skipped,duration_ms'

export function suiteGate(exitCode: number | null, resultsFile: string): void {
  if (exitCode !== 0) throw new Error('Tests failed. Deploy stopped before uploading.')
  if (!fs.existsSync(resultsFile)) {
    throw new Error('Tests finished without writing apps/web/public/test-results.csv.')
  }
  const body = fs.readFileSync(resultsFile, 'utf8')
  if (!body.includes(header)) {
    throw new Error('Tests finished without writing apps/web/public/test-results.csv.')
  }
}

export function runNpmTest(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['test'], { stdio: 'inherit' })
    child.on('error', () => {
      reject(new Error('Could not start the test suite. Deploy stopped before uploading.'))
    })
    child.on('close', (code) => {
      try {
        suiteGate(code, path.resolve(testResultsCsv))
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })
}
