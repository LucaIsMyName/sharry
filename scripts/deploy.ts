import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Client } from 'ssh2'
import {
  applyPublicUrls,
  parseDeployEnv,
  parseEnvFile,
  parseRuntimeEnv,
  redactSecrets,
  serializeEnv,
  splitEnv,
} from '@sharry/shared'
import { resolveEnvFile, upsertEnvKeys } from './env-file.ts'
import { ensureBuildMemoryCommand, minimumNodeVersion, nodeVersionIsCurrent, provisionHost } from './provision.ts'
import { ensureLocalSecrets, generatedDatabaseUrl } from './secrets.ts'
import { activateRelease } from './release.ts'
import { assertSafeRemoteDir, assertSafeServiceName, hostIsListed, hostKeyMatches, opensshFingerprint, privileged } from './ssh.ts'

const syncEnv = process.argv.includes('--sync-env')
const envPath = resolveEnvFile('production')
if (!fs.existsSync(envPath)) {
  console.error('Create .env.production before deploying. Copy .env.production.example and fill in DOMAIN, the SSH login, and the first administrator.')
  process.exit(1)
}

const fileVars: Record<string, string> = {}
try {
  for (const [key, value] of Object.entries(applyPublicUrls(parseEnvFile(fs.readFileSync(envPath, 'utf8'))))) {
    if (typeof value === 'string') fileVars[key] = value
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid environment configuration')
  process.exit(1)
}
const secretUpdates = ensureLocalSecrets(fileVars)
Object.assign(fileVars, secretUpdates)
const domain = fileVars.DOMAIN?.trim() ?? ''
if (!domain) {
  console.error('Set DOMAIN in .env.production to the public hostname, for example share.example.com.')
  process.exit(1)
}
const { deploy } = splitEnv(fileVars)
const deployEnv = parseDeployEnv(deploy)
const secrets: string[] = []
const remember = (value: string | undefined) => {
  if (value && value.length >= 8 && !secrets.includes(value)) secrets.push(value)
}
for (const key of ['SESSION_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL', 'INITIAL_ADMIN_PASSWORD', 'SMTP_PASSWORD']) {
  remember(fileVars[key])
}
for (const value of Object.values(secretUpdates)) remember(value)

if (deployEnv.DEPLOY_ENABLED !== 'true') {
  console.error('Set DEPLOY_ENABLED=true in .env.production before deploying.')
  process.exit(1)
}

assertSafeRemoteDir(deployEnv.DEPLOY_REMOTE_DIR)
assertSafeServiceName(deployEnv.DEPLOY_RESTART_SERVICE)

const remote = deployEnv.DEPLOY_REMOTE_DIR
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '')
const release = `${remote}/releases/${stamp}`
const knownHostsPath = deployEnv.DEPLOY_KNOWN_HOSTS_PATH ?? path.join(os.homedir(), '.ssh', 'known_hosts')
const knownHosts = await ensureKnownHost(knownHostsPath, deployEnv.DEPLOY_HOST, deployEnv.DEPLOY_PORT)
const privateKey = fs.readFileSync(deployEnv.DEPLOY_SSH_KEY_PATH)

const log = (message: string) => console.log(redactSecrets(message, secrets))

const conn = await connect()
try {
  const savedDatabaseUrl = fileVars.DATABASE_URL?.trim() ?? ''
  await provisionHost((command) => exec(conn, command, secrets), {
    domain,
    databaseUrl: savedDatabaseUrl,
    generatedDatabaseUrl: () => {
      const url = generatedDatabaseUrl()
      remember(url)
      return url
    },
    beforeDatabaseChanges: (databaseUrl) => {
      fileVars.DATABASE_URL = databaseUrl
      remember(databaseUrl)
      try {
        remember(decodeURIComponent(new URL(databaseUrl).password))
      } catch {
        // The full URL is still redacted when it appears in an error.
      }
      if (!savedDatabaseUrl) upsertEnvKeys(envPath, { DATABASE_URL: databaseUrl })
    },
  })
  const version = (await exec(conn, '/usr/bin/node -p process.versions.node', secrets)).stdout.trim()
  if (!nodeVersionIsCurrent(version)) {
    throw new Error(`The server must have Node.js ${minimumNodeVersion} or newer. Found ${version || 'no Node.js binary'}`)
  }
  const { runtime } = splitEnv(fileVars)
  const runtimeEnv = parseRuntimeEnv(runtime)
  remember(runtimeEnv.SESSION_SECRET)
  remember(runtimeEnv.ENCRYPTION_KEY)
  remember(runtimeEnv.DATABASE_URL)
  remember(runtimeEnv.INITIAL_ADMIN_PASSWORD)
  remember(runtimeEnv.SMTP_PASSWORD)
  await exec(
    conn,
    privileged(
      `mkdir -p ${remote}/releases ${remote}/shared/data ${remote}/backups ${release} && chown -R ${deployEnv.DEPLOY_USER} ${remote} && chown -R sharry:sharry ${remote}/shared/data && chmod 750 ${remote}/shared/data`,
    ),
    secrets,
  )
  const envFile = `${remote}/shared/.env`
  const envExists = (await exec(conn, `test -f ${envFile} && echo yes || echo no`, secrets)).stdout.includes('yes')
  if ((secretUpdates.SESSION_SECRET || secretUpdates.ENCRYPTION_KEY) && envExists && !syncEnv) {
    throw new Error(
      'SESSION_SECRET or ENCRYPTION_KEY is empty, but the server already has a runtime environment. Copy the existing values into .env.production. Deploy does not rotate them.',
    )
  }
  const archive = path.join(os.tmpdir(), `sharry-${stamp}.tgz`)
  await tarRepo(archive)
  await upload(conn, archive, `${remote}/incoming.tgz`)
  fs.rmSync(archive, { force: true })
  await exec(conn, `tar -xzf ${remote}/incoming.tgz -C ${release} && rm -f ${remote}/incoming.tgz`, secrets)
  await exec(conn, `ln -sfn ${remote}/shared/data ${release}/data`, secrets)
  await exec(conn, privileged(ensureBuildMemoryCommand()), secrets)
  try {
    await exec(conn, `cd ${release} && npm ci --no-audit --no-fund && npm run build`, secrets)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/Killed/.test(message) || /\(137\)/.test(message)) {
      throw new Error('The server ran out of memory while installing or building. Free some disk space for swap and run deploy again.')
    }
    throw error
  }
  if (Object.keys(secretUpdates).length > 0 && (syncEnv || !envExists)) upsertEnvKeys(envPath, secretUpdates)
  if (syncEnv || !envExists) {
    await writeRemoteFile(conn, envFile, serializeEnv(runtime), 0o600)
    log(syncEnv ? 'Updated the server runtime environment' : 'Wrote the server runtime environment')
  }
  const backup = `${remote}/backups/sharry-${stamp}.dump`
  await exec(conn, `cd ${release} && SHARRY_ENV_FILE=${envFile} npm run backup -- ${backup}`, secrets)
  await exec(conn, `cd ${release} && SHARRY_ENV_FILE=${envFile} npm run db:migrate`, secrets)
  const previous = (await exec(conn, `readlink ${remote}/current || true`, secrets)).stdout.trim()
  if (previous) await writeRemoteFile(conn, `${remote}/previous-release`, `${previous}\n`, 0o644)
  await installService(conn, remote, deployEnv.DEPLOY_RESTART_SERVICE, secrets)
  const restart = async () => {
    await exec(
      conn,
      privileged(`systemctl daemon-reload && systemctl enable ${deployEnv.DEPLOY_RESTART_SERVICE} && systemctl restart ${deployEnv.DEPLOY_RESTART_SERVICE}`),
      secrets,
    )
  }
  await activateRelease({
    previous,
    switchCurrent: () => exec(conn, `ln -sfn ${release} ${remote}/current`, secrets).then(() => undefined),
    restart,
    health: () => waitForHealth(deployEnv.DEPLOY_HEALTHCHECK_URL),
    prune: () => pruneReleases(conn, remote, secrets),
    restorePrevious: () => exec(conn, `ln -sfn ${previous} ${remote}/current`, secrets).then(() => undefined),
  })
  log('Deployment finished and the health check passed')
} catch (error) {
  const message = error instanceof Error ? error.message : 'Deployment failed'
  console.error(redactSecrets(message, secrets))
  process.exitCode = 1
} finally {
  conn.end()
}

async function ensureKnownHost(file: string, host: string, port: number): Promise<string> {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  if (hostIsListed(existing, host, port)) return existing
  const scanned = await sshKeyScan(host, port)
  const additions: string[] = []
  for (const line of scanned.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const parts = trimmed.split(/\s+/)
    const key = Buffer.from(parts[2] ?? '', 'base64')
    if (parts.length < 3 || key.length === 0) continue
    additions.push(trimmed)
    console.log(`Recorded SSH host key for ${host}: ${opensshFingerprint(key)}`)
  }
  if (additions.length === 0) throw new Error(`ssh-keyscan returned no host key for ${host}.`)
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const prefix = existing.length === 0 || existing.endsWith('\n') ? '' : '\n'
  fs.appendFileSync(file, `${prefix}${additions.join('\n')}\n`, { mode: 0o644 })
  return fs.readFileSync(file, 'utf8')
}

function sshKeyScan(host: string, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('ssh-keyscan', ['-p', String(port), '-T', '5', host], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) resolve(stdout)
      else reject(new Error(`Could not read the SSH host key for ${host}. ${stderr.trim()}`))
    })
  })
}

function connect(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client()
    let settled = false
    client.on('ready', () => {
      settled = true
      resolve(client)
    })
    client.on('error', (error) => {
      if (!settled) reject(error)
    })
    client.connect({
      host: deployEnv.DEPLOY_HOST,
      port: deployEnv.DEPLOY_PORT,
      username: deployEnv.DEPLOY_USER,
      privateKey,
      hostVerifier: (key: Buffer) => {
        const ok = hostKeyMatches(knownHosts, deployEnv.DEPLOY_HOST, deployEnv.DEPLOY_PORT, key)
        if (!ok) reject(new Error(`SSH host key verification failed for ${deployEnv.DEPLOY_HOST}`))
        return ok
      },
    })
  })
}

function exec(client: Client, command: string, secretValues: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (error, stream) => {
      if (error) {
        reject(error)
        return
      }
      let stdout = ''
      let stderr = ''
      stream.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      stream.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      stream.on('close', (code: number) => {
        if (code === 0) resolve({ stdout, stderr })
        else reject(new Error(redactSecrets(stderr || stdout || `Remote command failed (${code})`, secretValues)))
      })
    })
  })
}

function upload(client: Client, local: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    client.sftp((error, sftp) => {
      if (error) {
        reject(error)
        return
      }
      sftp.fastPut(local, remotePath, (putError) => {
        if (putError) reject(putError)
        else resolve()
      })
    })
  })
}

function writeRemoteFile(client: Client, remotePath: string, contents: string, mode: number): Promise<void> {
  return new Promise((resolve, reject) => {
    client.sftp((error, sftp) => {
      if (error) {
        reject(error)
        return
      }
      const stream = sftp.createWriteStream(remotePath, { mode })
      stream.on('error', reject)
      stream.on('close', () => resolve())
      stream.end(contents)
    })
  })
}

async function installService(client: Client, appDir: string, service: string, secretValues: string[]): Promise<void> {
  const template = fs.readFileSync(path.resolve('deploy/systemd/sharry.service'), 'utf8')
  const unit = template.replaceAll('__APP_DIR__', appDir)
  const unitPath = `/etc/systemd/system/${service}.service`
  const localUnit = path.join(os.tmpdir(), `${service}.service`)
  fs.writeFileSync(localUnit, unit)
  await upload(client, localUnit, `${appDir}/${service}.service`)
  fs.rmSync(localUnit, { force: true })
  await exec(client, privileged(`cp ${appDir}/${service}.service ${unitPath}`), secretValues)
}

async function pruneReleases(client: Client, appDir: string, secretValues: string[]): Promise<void> {
  await exec(
    client,
    `cd ${appDir}/releases && ls -1 | sort | head -n -5 | while read -r old; do rm -rf "$old"; done`,
    secretValues,
  )
}

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('Health check failed')
}

function tarRepo(archive: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'tar',
      ['-czf', archive, '--exclude', '.git', '--exclude', 'node_modules', '--exclude', '.env', '--exclude', '.env.*', '--exclude', 'data', '-C', process.cwd(), '.'],
      { stdio: 'inherit' },
    )
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error('Could not pack the release archive'))
    })
  })
}
