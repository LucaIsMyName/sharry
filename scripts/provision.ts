import { privileged } from './ssh.ts'

export type RemoteExec = (command: string) => Promise<{ stdout: string; stderr: string }>

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/

export function linuxDistro(osRelease: string): 'ubuntu' | 'debian' | null {
  const match = osRelease.match(/^ID=(?:"?)([a-z0-9]+)(?:"?)\s*$/m)
  if (match?.[1] === 'ubuntu' || match?.[1] === 'debian') return match[1]
  return null
}

export function databaseTarget(url: string): { user: string; password: string; database: string } {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL URL.')
  }
  const user = decodeURIComponent(parsed.username)
  const password = decodeURIComponent(parsed.password)
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (!identifier.test(user) || !identifier.test(database)) {
    throw new Error('DATABASE_URL user and database names must use letters, numbers, and underscores.')
  }
  if (!password) throw new Error('DATABASE_URL must include a password.')
  return { user, password, database }
}

export function caddySiteBlock(domain: string): string {
  return `${domain} {\n\treverse_proxy 127.0.0.1:3000\n}\n`
}

export function caddyHasSite(contents: string, domain: string): boolean {
  return contents.split('\n').some((line) => {
    const trimmed = line.trim().replace(/^https?:\/\//, '')
    return trimmed === domain || trimmed.startsWith(`${domain} `) || trimmed.startsWith(`${domain}{`) || trimmed.startsWith(`${domain},`)
  })
}

const caddyAskUrl = 'http://127.0.0.1:3000/internal/caddy/ask'
const onDemandSnippet = `\ton_demand_tls {\n\t\task ${caddyAskUrl}\n\t}`

export function caddyHasOnDemandTls(contents: string): boolean {
  return contents.includes('on_demand_tls')
}

export function caddyOnDemandTlsNeedsRepair(contents: string): boolean {
  return /on_demand_tls\s*\{[^}]*\b(?:interval|burst)\b/.test(contents)
}

export function caddyHasOnDemandSite(contents: string): boolean {
  return contents.split('\n').some((line) => line.trim().startsWith('https://'))
}

export function ensureCaddyOnDemand(contents: string, domain: string): { file: string; changed: boolean } {
  const needsSite = !caddyHasSite(contents, domain)
  const needsTls = !caddyHasOnDemandTls(contents) || caddyOnDemandTlsNeedsRepair(contents)
  const needsCatchAll = !caddyHasOnDemandSite(contents)
  if (!needsSite && !needsTls && !needsCatchAll) return { file: contents, changed: false }

  let text = contents.replace(/\s*$/, '')
  if (needsSite) {
    const site = caddySiteBlock(domain).trimEnd()
    text = text ? `${text}\n\n${site}` : site
  }
  if (needsTls) {
    if (/on_demand_tls\s*\{/.test(text)) {
      text = text.replace(/[ \t]*on_demand_tls\s*\{[^}]*\}/, onDemandSnippet)
    } else {
      const lines = text.split('\n')
      const globalStart = lines.findIndex((line) => line.trim() === '{')
      if (globalStart >= 0) {
        lines.splice(globalStart + 1, 0, onDemandSnippet)
        text = lines.join('\n')
      } else {
        text = `{\n${onDemandSnippet}\n}\n\n${text}`
      }
    }
  }
  if (needsCatchAll) {
    const site = `https:// {\n\ttls {\n\t\ton_demand\n\t}\n\treverse_proxy 127.0.0.1:3000\n}`
    text = text ? `${text}\n\n${site}` : site
  }
  return { file: `${text.replace(/\s*$/, '')}\n`, changed: true }
}

/** Oldest Node.js 22 release that includes the October 21, 2026 security fixes. */
export const minimumNodeVersion = '22.23.4'

export function nodeVersionIsCurrent(version: string, minimum = minimumNodeVersion): boolean {
  const current = numericParts(version)
  const required = numericParts(minimum)
  if (!current || !required) return false
  const length = Math.max(current.length, required.length)
  for (let index = 0; index < length; index += 1) {
    const left = current[index] ?? 0
    const right = required[index] ?? 0
    if (left > right) return true
    if (left < right) return false
  }
  return true
}

function numericParts(version: string): number[] | null {
  const match = version.trim().match(/^v?(\d+(?:\.\d+)*)$/)
  if (!match?.[1]) return null
  return match[1].split('.').map((part) => Number(part))
}

export function nodeInstallScript(): string {
  return `set -euo pipefail
required='${minimumNodeVersion}'
if [ -x /usr/bin/node ]; then
  current="$(/usr/bin/node -p 'process.versions.node')"
else
  current=0
fi
lowest="$(printf '%s\\n%s\\n' "$required" "$current" | sort -V | head -n1)"
if [ "$lowest" = "$required" ]; then
  exit 0
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl xz-utils
arch="$(uname -m)"
case "$arch" in
  x86_64) nodearch=x64 ;;
  aarch64|arm64) nodearch=arm64 ;;
  *) echo "Unsupported CPU architecture: $arch" >&2; exit 1 ;;
esac
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
curl -fsSL "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt" -o "$workdir/SHASUMS256.txt"
name="$(awk -v arch="$nodearch" '$2 ~ ("node-v[0-9.]+-linux-" arch "[.]tar[.]xz$") { print $2; exit }' "$workdir/SHASUMS256.txt")"
if [ -z "$name" ]; then
  echo "Could not find a Node.js 22 archive for $nodearch" >&2
  exit 1
fi
curl -fsSL "https://nodejs.org/dist/latest-v22.x/\${name}" -o "$workdir/$name"
(cd "$workdir" && grep "  \${name}$" SHASUMS256.txt | sha256sum -c -)
tar -xJf "$workdir/$name" -C /usr/local --strip-components=1
ln -sfn /usr/local/bin/node /usr/bin/node
ln -sfn /usr/local/bin/npm /usr/bin/npm
ln -sfn /usr/local/bin/npx /usr/bin/npx
`
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export function psqlCommand(sql: string, database?: string): string {
  const encoded = Buffer.from(sql).toString('base64')
  const db = database && identifier.test(database) ? ` -d ${database}` : ''
  const args = `-v ON_ERROR_STOP=1 -tA${db} -f -`
  return `if [ "$(id -u)" -eq 0 ]; then echo ${encoded} | base64 -d | runuser -u postgres -- psql ${args}; else echo ${encoded} | base64 -d | sudo -n -u postgres psql ${args}; fi`
}

export async function provisionHost(
  run: RemoteExec,
  input: {
    domain: string
    databaseUrl: string | undefined
    generatedDatabaseUrl: () => string
    beforeDatabaseChanges: (databaseUrl: string) => void
    log?: (message: string) => void
  },
): Promise<void> {
  const log = input.log ?? (() => undefined)
  log('Checking the operating system')
  const osRelease = (await run('cat /etc/os-release')).stdout
  const distro = linuxDistro(osRelease)
  if (!distro) {
    const id = osRelease.match(/^ID=(?:"?)([^"\n]+)/m)?.[1] ?? 'unknown'
    throw new Error(`This deploy supports Ubuntu and Debian. This server reports ID=${id}.`)
  }
  log('Ensuring Node.js')
  await run(privileged(nodeInstallScript()))
  log('Ensuring PostgreSQL and the sharry user')
  await run(
    privileged(`set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if ! command -v pg_dump >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1; then
  apt-get update
  apt-get install -y postgresql postgresql-client
fi
systemctl enable --now postgresql
for _ in 1 2 3 4 5 6 7 8 9 10; do
  pg_isready -q && break
  sleep 1
done
pg_isready -q
if ! id sharry >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin sharry
fi`),
  )

  log('Ensuring the database')
  let databaseUrl = input.databaseUrl?.trim() ?? ''
  const roleName = databaseUrl ? databaseTarget(databaseUrl).user : 'sharry'
  const role = (await run(psqlCommand(`SELECT 1 FROM pg_roles WHERE rolname = ${sqlLiteral(roleName)}`))).stdout.trim()
  if (!databaseUrl) {
    if (role === '1') {
      throw new Error(
        'The sharry database role already exists. Set DATABASE_URL in .env.production to its current connection string. Deploy does not change an existing database password.',
      )
    }
    databaseUrl = input.generatedDatabaseUrl()
  }
  input.beforeDatabaseChanges(databaseUrl)
  const target = databaseTarget(databaseUrl)
  if (role !== '1') {
    await run(psqlCommand(`CREATE ROLE ${target.user} LOGIN PASSWORD ${sqlLiteral(target.password)}`))
  }
  const database = (await run(psqlCommand(`SELECT 1 FROM pg_database WHERE datname = ${sqlLiteral(target.database)}`))).stdout.trim()
  if (database !== '1') {
    await run(psqlCommand(`CREATE DATABASE ${target.database} OWNER ${target.user}`))
    await run(psqlCommand(`ALTER SCHEMA public OWNER TO ${target.user}`, target.database))
  }

  log('Ensuring Caddy')
  await run(
    privileged(`set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if ! command -v caddy >/dev/null 2>&1; then
  apt-get update
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  install -d /usr/share/keyrings
  rm -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi
systemctl enable caddy`),
  )

  let caddyfile = ''
  try {
    caddyfile = (await run(privileged('cat /etc/caddy/Caddyfile'))).stdout
  } catch {
    caddyfile = ''
  }
  const next = ensureCaddyOnDemand(caddyfile, input.domain)
  if (next.changed) {
    const encoded = Buffer.from(next.file).toString('base64')
    await run(
      privileged(`set -euo pipefail
echo ${encoded} | base64 -d > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy`),
    )
  } else {
    await run(privileged('systemctl start caddy'))
  }

  log('Checking the firewall')
  await run(
    privileged(`set -euo pipefail
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi`),
  )
}

export function ensureBuildMemoryCommand(): string {
  return `set -euo pipefail
avail_kb=$(grep MemAvailable /proc/meminfo | tr -s " " | cut -d " " -f 2)
swap_free_kb=$(grep SwapFree /proc/meminfo | tr -s " " | cut -d " " -f 2)
if [ "$((avail_kb + swap_free_kb))" -ge 2500000 ]; then
  exit 0
fi
if ! swapon --show | tr -s " " | cut -d " " -f 1 | grep -qx /swapfile; then
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
fi
grep -qs /swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab`
}

export function buildRanOutOfMemory(output: string): boolean {
  return /Killed/.test(output)
    || /\(137\)/.test(output)
    || /JavaScript heap out of memory/.test(output)
    || /Reached heap limit/.test(output)
    || /npm error code 134/.test(output)
}
