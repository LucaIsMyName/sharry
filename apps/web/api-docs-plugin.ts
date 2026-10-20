import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { extractApiDocs } from '../../scripts/generate-api-docs.ts'

const virtualId = 'virtual:api-docs'
const resolvedId = '\0virtual:api-docs'

export function apiDocsPlugin(apiDir: string): Plugin {
  return {
    name: 'sharry-api-docs',
    resolveId(id) {
      if (id === virtualId) return resolvedId
    },
    load(id) {
      if (id !== resolvedId) return null
      if (fs.existsSync(apiDir)) {
        for (const file of fs.readdirSync(apiDir)) {
          if (file.endsWith('.ts')) this.addWatchFile(path.join(apiDir, file))
        }
      }
      return `export default ${JSON.stringify(extractApiDocs(apiDir))}`
    },
  }
}
