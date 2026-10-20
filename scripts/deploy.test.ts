import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { upsertEnvKeys } from './env-file.ts'
import { caddyHasSite, caddySiteBlock, databaseTarget, ensureBuildMemoryCommand, linuxDistro, nodeInstallScript, provisionHost, psqlCommand } from './provision.ts'
import { ensureLocalSecrets, generatedDatabaseUrl } from './secrets.ts'
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

  it('adds swap when free memory is below 1.5 GB', () => {
    const command = ensureBuildMemoryCommand()
    expect(command).toContain('MemAvailable')
    expect(command).toContain('/swapfile')
    expect(command).toContain('1500000')
  })

  it('runs root commands without sudo and other commands with sudo -n', () => {
    const asRoot = privileged('systemctl restart sharry')
    expect(asRoot).toContain('id -u')
    expect(asRoot).toContain('sudo -n')
    expect(asRoot).toContain('systemctl restart sharry')
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
    const script = nodeInstallScript()
    expect(script).toContain('/usr/bin/node')
    expect(script).toContain('latest-v22.x')
    expect(spawnSync('bash', ['-n'], { input: script }).status).toBe(0)
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
          caddy: 'share.example.com {\n}\n',
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
      },
    )
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
    expect(file).toContain('reverse_proxy 127.0.0.1:3000')
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
