import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Client } from 'ssh2'
import {
  parseDeployEnv,
  parseEnvFile,
  parseRuntimeEnv,
  redactSecrets,
  serializeEnv,
  splitEnv,
} from '@sharry/shared'
import { assertSafeRemoteDir, assertSafeServiceName, hostKeyMatches } from './ssh.ts'

const syncEnv = process.argv.includes('--sync-env')
const envPath = process.env.SHARRY_ENV_FILE ?? '.env'
if (!fs.existsSync(envPath)) {
  console.error('Create a local .env before deploying.')
  process.exit(1)
}

const fileVars = parseEnvFile(fs.readFileSync(envPath, 'utf8'))
const { runtime, deploy } = splitEnv(fileVars)
const deployEnv = parseDeployEnv(deploy)
const runtimeEnv = parseRuntimeEnv(runtime)
const secrets = [
  runtimeEnv.SESSION_SECRET,
  runtimeEnv.ENCRYPTION_KEY,
  runtimeEnv.INITIAL_ADMIN_PASSWORD ?? '',
  runtimeEnv.SMTP_PASSWORD,
  runtimeEnv.DATABASE_URL,
].filter((value) => value.length >= 8)

if (deployEnv.DEPLOY_ENABLED !== 'true') {
  console.error('Set DEPLOY_ENABLED=true in the local deployment .env before deploying.')
  process.exit(1)
}

assertSafeRemoteDir(deployEnv.DEPLOY_REMOTE_DIR)
assertSafeServiceName(deployEnv.DEPLOY_RESTART_SERVICE)

const remote = deployEnv.DEPLOY_REMOTE_DIR
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '')
const release = `${remote}/releases/${stamp}`
const knownHostsPath = deployEnv.DEPLOY_KNOWN_HOSTS_PATH ?? path.join(os.homedir(), '.ssh', 'known_hosts')
if (!fs.existsSync(knownHostsPath)) {
  console.error(`Known hosts file not found at ${knownHostsPath}. Refusing to trust an unknown server.`)
  process.exit(1)
}
const knownHosts = fs.readFileSync(knownHostsPath, 'utf8')
const privateKey = fs.readFileSync(deployEnv.DEPLOY_SSH_KEY_PATH)

const log = (message: string) => console.log(redactSecrets(message, secrets))

const conn = await connect()
try {
  await exec(conn, 'node -p process.versions.node', secrets)
  const version = (await exec(conn, 'node -p process.versions.node', secrets)).stdout.trim()
  const major = Number(version.split('.')[0])
  if (!Number.isFinite(major) || major < 22) {
    throw new Error(`The server must have Node.js 22 or newer. Found ${version}`)
  }
  await exec(conn, `mkdir -p ${remote}/releases ${remote}/shared/data ${remote}/backups ${release}`, secrets)
  const archive = path.join(os.tmpdir(), `sharry-${stamp}.tgz`)
  await tarRepo(archive)
  await upload(conn, archive, `${remote}/incoming.tgz`)
  fs.rmSync(archive, { force: true })
  await exec(conn, `tar -xzf ${remote}/incoming.tgz -C ${release} && rm -f ${remote}/incoming.tgz`, secrets)
  await exec(conn, `ln -sfn ${remote}/shared/data ${release}/data`, secrets)
  await exec(conn, `cd ${release} && npm ci && npm run build`, secrets)
  const envFile = `${remote}/shared/.env`
  const envExists = (await exec(conn, `test -f ${envFile} && echo yes || echo no`, secrets)).stdout.includes('yes')
  if (syncEnv) {
    await writeRemoteFile(conn, envFile, serializeEnv(runtime), 0o600)
    log('Updated the server runtime environment')
  } else if (!envExists) {
    throw new Error('The server has no runtime environment. Deploy again with --sync-env.')
  }
  const backup = `${remote}/backups/sharry-${stamp}.dump`
  await exec(conn, `cd ${release} && SHARRY_ENV_FILE=${envFile} npm run backup -- ${backup}`, secrets)
  await exec(conn, `cd ${release} && SHARRY_ENV_FILE=${envFile} npm run db:migrate`, secrets)
  const previous = (await exec(conn, `readlink ${remote}/current || true`, secrets)).stdout.trim()
  if (previous) await writeRemoteFile(conn, `${remote}/previous-release`, `${previous}\n`, 0o644)
  await exec(conn, `ln -sfn ${release} ${remote}/current`, secrets)
  await installService(conn, remote, deployEnv.DEPLOY_RESTART_SERVICE, secrets)
  await exec(conn, `sudo -n systemctl daemon-reload && sudo -n systemctl enable ${deployEnv.DEPLOY_RESTART_SERVICE} && sudo -n systemctl restart ${deployEnv.DEPLOY_RESTART_SERVICE}`, secrets)
  await pruneReleases(conn, remote, secrets)
  await waitForHealth(deployEnv.DEPLOY_HEALTHCHECK_URL)
  log('Deployment finished and the health check passed')
} catch (error) {
  const message = error instanceof Error ? error.message : 'Deployment failed'
  console.error(redactSecrets(message, secrets))
  process.exitCode = 1
} finally {
  conn.end()
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
  await exec(client, `sudo -n cp ${appDir}/${service}.service ${unitPath}`, secretValues)
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
      ['-czf', archive, '--exclude', '.git', '--exclude', 'node_modules', '--exclude', '.env', '--exclude', 'data', '-C', process.cwd(), '.'],
      { stdio: 'inherit' },
    )
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error('Could not pack the release archive'))
    })
  })
}
