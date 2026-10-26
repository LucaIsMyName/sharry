import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { upsertEnvKeys } from './env-file.ts'
import { buildRanOutOfMemory, caddyHasSite, caddySiteBlock, databaseTarget, ensureBuildMemoryCommand, ensureCaddyOnDemand, linuxDistro, minimumNodeVersion, nodeInstallScript, nodeVersionIsCurrent, provisionHost, psqlCommand } from './provision.ts'
import { ensureLocalSecrets, generatedDatabaseUrl } from './secrets.ts'
import { formatDeploySummary } from './deploy-summary.ts'
import { activateRelease } from './release.ts'
import { assertSafeRemoteDir, assertSafeServiceName, hostIsListed, hostKeyMatches, opensshFingerprint, privileged } from './ssh.ts'

describe('deploy safety', () => {
  it('rejects unsafe remote paths and service names', () => {
    expect(() => assertSafeRemoteDir('/var/www/sharry')).not.toThrow()
    expect(() => assertSafeRemoteDir('relative')).toThrow(/absolute/)
    expect(() => assertSafeRemoteDir('/tmp/../etc')).toThrow(/absolute/)
    expect(() => assertSafeServiceName('sharry')).not.toThrow()
    expect(() => assertSafeServiceName('sharry;reboot')).toThrow(/Service name/)
  })

  it('matches a known host key and rejects a different one', () => {
    const key = crypto.randomBytes(32)
    const known = `203.0.113.10 ssh-ed25519 ${key.toString('base64')}`
    expect(hostKeyMatches(known, '203.0.113.10', 22, key)).toBe(true)
    expect(hostKeyMatches(known, '203.0.113.10', 22, crypto.randomBytes(32))).toBe(false)
    expect(hostKeyMatches(known, '198.51.100.8', 22, key)).toBe(false)
    expect(hostIsListed(known, '203.0.113.10', 22)).toBe(true)
    expect(hostIsListed(known, '198.51.100.8', 22)).toBe(false)
    expect(opensshFingerprint(key)).toMatch(/^SHA256:/)
  })

  it('adds swap when free memory is below 2.5 GB', () => {
    const command = ensureBuildMemoryCommand()
    expect(command).toContain('MemAvailable')
    expect(command).toContain('/swapfile')
    expect(command).toContain('2500000')
  })

  it('treats a V8 heap abort and an operating-system kill as the same memory failure', () => {
    expect(buildRanOutOfMemory('FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\nnpm error code 134')).toBe(true)
    expect(buildRanOutOfMemory('Killed\n(137)')).toBe(true)
    expect(buildRanOutOfMemory('npm error code 1\nType error')).toBe(false)
  })

  it('runs root commands without sudo and other commands with sudo -n', () => {
    const asRoot = privileged('systemctl restart sharry')
    expect(asRoot).toContain('id -u')
    expect(asRoot).toContain('sudo -n')
    expect(asRoot).toContain('systemctl restart sharry')
  })
})

describe('release activation', () => {
  it('prunes only after the health check and restores the previous release when it fails', async () => {
    const steps: string[] = []
    await expect(activateRelease({
      previous: '/var/www/sharry/releases/old',
      switchCurrent: async () => { steps.push('switch') },
      restart: async () => { steps.push('restart') },
      health: async () => { throw new Error('Health check failed') },
      prune: async () => { steps.push('prune') },
      restorePrevious: async () => { steps.push('restore') },
    })).rejects.toThrow('Health check failed')
    expect(steps).toEqual(['switch', 'restart', 'restore', 'restart'])
  })

  it('leaves the new release in place when health passes', async () => {
    const steps: string[] = []
    await activateRelease({
      previous: '/var/www/sharry/releases/old',
      switchCurrent: async () => { steps.push('switch') },
      restart: async () => { steps.push('restart') },
      health: async () => { steps.push('health') },
      prune: async () => { steps.push('prune') },
      restorePrevious: async () => { steps.push('restore') },
    })
    expect(steps).toEqual(['switch', 'restart', 'health', 'prune'])
  })

  it('does not restore a release on the first deploy', async () => {
    const steps: string[] = []
    await expect(activateRelease({
      previous: '',
      switchCurrent: async () => { steps.push('switch') },
      restart: async () => { steps.push('restart') },
      health: async () => { throw new Error('Health check failed') },
      prune: async () => { steps.push('prune') },
      restorePrevious: async () => { steps.push('restore') },
    })).rejects.toThrow('Health check failed')
    expect(steps).toEqual(['switch', 'restart'])
  })
})

describe('local secrets', () => {
  it('fills empty secrets once and does not rotate them', () => {
    const created = ensureLocalSecrets({ SESSION_SECRET: '', ENCRYPTION_KEY: '   ' })
    expect(created.SESSION_SECRET?.length).toBeGreaterThanOrEqual(32)
    expect(created.ENCRYPTION_KEY?.length).toBeGreaterThanOrEqual(32)
    const kept = {
      SESSION_SECRET: created.SESSION_SECRET ?? '',
      ENCRYPTION_KEY: created.ENCRYPTION_KEY ?? '',
    }
    expect(ensureLocalSecrets(kept)).toEqual({})
    expect(ensureLocalSecrets({ SESSION_SECRET: kept.SESSION_SECRET, ENCRYPTION_KEY: 'already-set-and-long-enough-value' })).toEqual({})
  })

  it('writes generated keys back without dropping comments', () => {
    const file = path.join(os.tmpdir(), `sharry-env-${crypto.randomBytes(4).toString('hex')}`)
    fs.writeFileSync(file, '# keep me\nAPP_URL=http://127.0.0.1:5173\nSESSION_SECRET=\n')
    upsertEnvKeys(file, { SESSION_SECRET: 'test-session-secret-should-be-long-enough', DATABASE_URL: 'postgresql://sharry:pw@127.0.0.1:5432/sharry' })
    const text = fs.readFileSync(file, 'utf8')
    fs.rmSync(file, { force: true })
    expect(text).toContain('# keep me')
    expect(text).toContain('APP_URL=http://127.0.0.1:5173')
    expect(text).toContain('SESSION_SECRET=test-session-secret-should-be-long-enough')
    expect(text).toContain('DATABASE_URL=postgresql://sharry:pw@127.0.0.1:5432/sharry')
    expect(text.match(/SESSION_SECRET=/g)).toHaveLength(1)
  })
})

describe('deploy summary', () => {
  const secret = 'super-secret-db-password'

  it('prints the public URL and leaves out secrets', () => {
    const summary = formatDeploySummary({
      appName: 'Sharry',
      version: '0.0.40',
      url: 'https://share.example.com',
      shortUrlBase: 'https://go.example.com',
      healthUrl: 'https://share.example.com/health',
      host: '203.0.113.10',
      user: 'deploy',
      port: 22,
      release: '/var/www/sharry/releases/20261026084100',
      service: 'sharry',
      nodeVersion: '22.23.4',
      durationMs: 134_000,
    })
    expect(summary).toBe(`Sharry 0.0.40 was deployed

  URL        https://share.example.com
  Short URLs https://go.example.com
  Health     https://share.example.com/health
  Host       deploy@203.0.113.10:22
  Release    /var/www/sharry/releases/20261026084100
  Service    sharry
  Node       22.23.4
  Duration   2m 14s`)
    expect(summary).not.toContain(secret)
    expect(summary).not.toContain('DATABASE_URL')
    expect(formatDeploySummary({
      appName: 'Sharry',
      version: '0.0.40',
      url: 'https://share.example.com',
      shortUrlBase: 'https://share.example.com',
      healthUrl: 'https://share.example.com/health',
      host: '203.0.113.10',
      user: 'deploy',
      port: 22,
      release: '/var/www/sharry/releases/20261026084100',
      service: 'sharry',
      nodeVersion: '22.23.4',
      durationMs: 3_661_000,
    })).toContain('1h 1m 1s')
  })

  it('omits the short URL line when it matches the app URL', () => {
    const summary = formatDeploySummary({
      appName: 'Sharry',
      version: '0.0.40',
      url: 'https://share.example.com',
      shortUrlBase: 'https://share.example.com',
      healthUrl: 'https://share.example.com/health',
      host: '203.0.113.10',
      user: 'deploy',
      port: 22,
      release: '/var/www/sharry/releases/20261026084100',
      service: 'sharry',
      nodeVersion: '22.23.4',
      durationMs: 0,
    })
    expect(summary).toBe(`Sharry 0.0.40 was deployed

  URL      https://share.example.com
  Health   https://share.example.com/health
  Host     deploy@203.0.113.10:22
  Release  /var/www/sharry/releases/20261026084100
  Service  sharry
  Node     22.23.4
  Duration 0s`)
    expect(summary).not.toContain('Short URLs')
    expect(summary).not.toContain(secret)
  })
})

function remoteResult(command: string, options: { os: string; role: string; caddy: string }): { stdout: string; stderr: string } {
  if (command.includes('/etc/os-release')) return { stdout: options.os, stderr: '' }
  const encoded = command.match(/echo ([A-Za-z0-9+/=]+) \| base64/)?.[1]
  if (encoded) {
    const sql = Buffer.from(encoded, 'base64').toString('utf8')
    if (sql.includes('pg_roles') || sql.includes('pg_database')) return { stdout: options.role, stderr: '' }
  }
  if (command.includes('Caddyfile') && !command.includes('base64 -d >')) return { stdout: options.caddy, stderr: '' }
  return { stdout: '', stderr: '' }
}

describe('server bootstrap', () => {
  it('recognises Ubuntu and Debian and leaves an existing site alone', async () => {
    expect(linuxDistro('ID=ubuntu\n')).toBe('ubuntu')
    expect(linuxDistro('ID="debian"\n')).toBe('debian')
    expect(linuxDistro('ID=fedora\n')).toBeNull()
    expect(caddyHasSite('share.example.com {\n\treverse_proxy 127.0.0.1:3000\n}\n', 'share.example.com')).toBe(true)
    expect(caddyHasSite('# share.example.com\n:80 {\n}\n', 'share.example.com')).toBe(false)
    expect(caddySiteBlock('share.example.com')).toContain('reverse_proxy 127.0.0.1:3000')
    const partial = ensureCaddyOnDemand('share.example.com {\n\treverse_proxy 127.0.0.1:3000\n}\n', 'share.example.com')
    expect(partial.changed).toBe(true)
    expect(partial.file.match(/share\.example\.com \{/g)).toHaveLength(1)
    expect(partial.file).toContain('on_demand_tls')
    expect(partial.file).toContain('ask http://127.0.0.1:3000/internal/caddy/ask')
    expect(partial.file).not.toContain('interval')
    expect(partial.file).not.toContain('burst')
    expect(partial.file).toContain('https:// {')
    const stale = ensureCaddyOnDemand('{\n\ton_demand_tls {\n\t\task http://127.0.0.1:3000/internal/caddy/ask\n\t\tinterval 2m\n\t\tburst 5\n\t}\n}\n\nshare.example.com {\n\treverse_proxy 127.0.0.1:3000\n}\n\nhttps:// {\n\ttls {\n\t\ton_demand\n\t}\n}\n', 'share.example.com')
    expect(stale.changed).toBe(true)
    expect(stale.file).not.toContain('interval')
    expect(stale.file).not.toContain('burst')
    expect(stale.file.match(/on_demand_tls/g)).toHaveLength(1)
    expect(stale.file.match(/share\.example\.com \{/g)).toHaveLength(1)
    const withGlobal = ensureCaddyOnDemand('{\n\temail admin@example.com\n}\n\nshare.example.com {\n\treverse_proxy 127.0.0.1:3000\n}\n', 'share.example.com')
    expect(withGlobal.file.match(/^\{$/gm)).toHaveLength(1)
    expect(withGlobal.file).toContain('email admin@example.com')
    expect(withGlobal.file).toContain('on_demand_tls')
    expect(ensureCaddyOnDemand(partial.file, 'share.example.com').changed).toBe(false)
    const script = nodeInstallScript()
    expect(script).toContain('/usr/bin/node')
    expect(script).toContain('latest-v22.x')
    expect(script).toContain(minimumNodeVersion)
    expect(script).toContain('sort -V')
    expect(spawnSync('bash', ['-n'], { input: script }).status).toBe(0)
    expect(nodeVersionIsCurrent('22.21.0')).toBe(false)
    expect(nodeVersionIsCurrent('22.23.3')).toBe(false)
    expect(nodeVersionIsCurrent('22.23.4')).toBe(true)
    expect(nodeVersionIsCurrent('22.24.0')).toBe(true)
    expect(nodeVersionIsCurrent('20.19.6')).toBe(false)
    const archive = spawnSync('awk', ['-v', 'arch=x64', '$2 ~ ("node-v[0-9.]+-linux-" arch "[.]tar[.]xz$") { print $2; exit }'], {
      input: 'abc  node-v22.21.0-linux-arm64.tar.xz\nabc  node-v22.21.0-linux-x64.tar.xz\n',
    })
    expect(archive.stdout.toString().trim()).toBe('node-v22.21.0-linux-x64.tar.xz')

    const password = 'super-secret-db-password'
    const sql = psqlCommand(`CREATE ROLE sharry LOGIN PASSWORD '${password}'`)
    expect(sql).not.toContain(password)
    expect(sql).toContain('runuser -u postgres')
    expect(databaseTarget(generatedDatabaseUrl()).user).toBe('sharry')

    const commands: string[] = []
    const phases: string[] = []
    let saved = false
    let createdRole = false
    await provisionHost(
      async (command) => {
        const encoded = command.match(/echo ([A-Za-z0-9+/=]+) \| base64/)?.[1]
        const sql = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : ''
        if (sql.includes('CREATE ROLE')) {
          createdRole = true
          if (!saved) throw new Error('database password was used before it was saved')
        }
        commands.push(command)
        return remoteResult(command, {
          os: 'ID=ubuntu\n',
          role: '1\n',
          caddy: '{\n\ton_demand_tls {\n\t\task http://127.0.0.1:3000/internal/caddy/ask\n\t}\n}\n\nshare.example.com {\n}\n\nhttps:// {\n\ttls {\n\t\ton_demand\n\t}\n\treverse_proxy 127.0.0.1:3000\n}\n',
        })
      },
      {
        domain: 'share.example.com',
        databaseUrl: `postgresql://sharry:${password}@127.0.0.1:5432/sharry`,
        generatedDatabaseUrl: () => {
          throw new Error('existing database URL should be reused')
        },
        beforeDatabaseChanges: () => {
          saved = true
        },
        log: (message) => {
          phases.push(message)
        },
      },
    )
    expect(phases).toEqual([
      'Checking the operating system',
      'Ensuring Node.js',
      'Ensuring PostgreSQL and the sharry user',
      'Ensuring the database',
      'Ensuring Caddy',
      'Checking the firewall',
    ])
    const joined = commands.join('\n')
    expect(createdRole).toBe(false)
    expect(joined).not.toContain(password)
    expect(joined).not.toContain('base64 -d > /etc/caddy/Caddyfile')
    expect(joined).toContain('ufw allow 80/tcp')
    expect(joined).not.toContain('ufw enable')
  })

  it('adds a missing Caddy site and saves a new database URL before creating the role', async () => {
    const commands: string[] = []
    let saved = ''
    await provisionHost(
      async (command) => {
        const encoded = command.match(/echo ([A-Za-z0-9+/=]+) \| base64/)?.[1]
        const sql = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : ''
        if (sql.startsWith('CREATE ROLE') && !saved) throw new Error('database password was used before it was saved')
        commands.push(command)
        return remoteResult(command, { os: 'ID=ubuntu\n', role: '\n', caddy: ':80 {\n}\n' })
      },
      {
        domain: 'share.example.com',
        databaseUrl: '',
        generatedDatabaseUrl: () => 'postgresql://sharry:generated-password-value@127.0.0.1:5432/sharry',
        beforeDatabaseChanges: (url) => {
          saved = url
        },
      },
    )
    expect(saved).toBe('postgresql://sharry:generated-password-value@127.0.0.1:5432/sharry')
    const wrote = commands.find((command) => command.includes('base64 -d > /etc/caddy/Caddyfile'))
    expect(wrote).toBeTruthy()
    const encoded = wrote?.match(/echo ([A-Za-z0-9+/=]+)/)?.[1] ?? ''
    const file = Buffer.from(encoded, 'base64').toString('utf8')
    expect(file).toContain(':80 {')
    expect(file).toContain('share.example.com {')
    expect(file).toContain('on_demand_tls')
    expect(file).toContain('https:// {')
    expect(file).toContain('reverse_proxy 127.0.0.1:3000')
    expect(file.match(/share\.example\.com \{/g)).toHaveLength(1)
  })

  it('stops when the database role already exists and no URL is saved', async () => {
    await expect(
      provisionHost(
        async (command) => remoteResult(command, { os: 'ID=debian\n', role: '1\n', caddy: '' }),
        {
          domain: 'share.example.com',
          databaseUrl: '',
          generatedDatabaseUrl: () => generatedDatabaseUrl(),
          beforeDatabaseChanges: () => undefined,
        },
      ),
    ).rejects.toThrow(/already exists/)
  })

  it('refuses a server that is not Ubuntu or Debian', async () => {
    await expect(
      provisionHost(async () => ({ stdout: 'ID=fedora\n', stderr: '' }), {
        domain: 'share.example.com',
        databaseUrl: 'postgresql://sharry:pw@127.0.0.1:5432/sharry',
        generatedDatabaseUrl,
        beforeDatabaseChanges: () => undefined,
      }),
    ).rejects.toThrow(/Ubuntu and Debian/)
  })
})
