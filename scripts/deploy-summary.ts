export type DeploySummary = {
  appName: string
  version: string
  url: string
  shortUrlBase: string
  healthUrl: string
  host: string
  user: string
  port: number
  release: string
  service: string
  nodeVersion: string
  durationMs: number
}

export function formatDeploySummary(summary: DeploySummary): string {
  const rows: Array<[string, string]> = [['URL', summary.url]]
  if (summary.shortUrlBase !== summary.url) rows.push(['Short URLs', summary.shortUrlBase])
  rows.push(
    ['Health', summary.healthUrl],
    ['Host', `${summary.user}@${summary.host}:${summary.port}`],
    ['Release', summary.release],
    ['Service', summary.service],
    ['Node', summary.nodeVersion],
    ['Duration', formatDuration(summary.durationMs)],
  )
  const width = Math.max(...rows.map(([label]) => label.length))
  const lines = rows.map(([label, value]) => `  ${label.padEnd(width)} ${value}`)
  return `${summary.appName} ${summary.version} was deployed\n\n${lines.join('\n')}`
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}
