import nodemailer from 'nodemailer'
import type { RuntimeEnv } from '@sharry/shared'
import type { AppSettings } from './settings-store.ts'
import { decryptString } from './support.ts'

export type MailMessage = {
  to: string
  subject: string
  text: string
}

export type Mailer = {
  send(message: MailMessage): Promise<void>
}

export function createSmtpMailer(env: RuntimeEnv): Mailer | null {
  if (!env.SMTP_HOST || !env.EMAIL_FROM) return null
  return buildMailer({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.EMAIL_FROM,
  })
}

export function mailerFor(settings: AppSettings, env: RuntimeEnv): Mailer | null {
  const savedHost = settings.smtpHost.trim()
  const savedFrom = settings.emailFrom.trim()
  if (savedHost && savedFrom) {
    let password = ''
    if (settings.smtpPasswordEncrypted) {
      try {
        password = decryptString(settings.smtpPasswordEncrypted, env.ENCRYPTION_KEY)
      } catch {
        password = ''
      }
    }
    return buildMailer({
      host: savedHost,
      port: settings.smtpPort,
      user: settings.smtpUser.trim(),
      password,
      from: savedFrom,
    })
  }
  return createSmtpMailer(env)
}

export function smtpSource(settings: AppSettings, env: RuntimeEnv): 'app' | 'environment' | 'none' {
  if (settings.smtpHost.trim() && settings.emailFrom.trim()) return 'app'
  if (env.SMTP_HOST && env.EMAIL_FROM) return 'environment'
  return 'none'
}

export function smtpTransportOptions(host: string, port: number): {
  secure: boolean
  requireTLS?: boolean
  tls?: { minVersion: 'TLSv1.2' }
} {
  if (port === 465) return { secure: true }
  if (isLoopbackHost(host)) return { secure: false }
  return { secure: false, requireTLS: true, tls: { minVersion: 'TLSv1.2' } }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function buildMailer(config: { host: string; port: number; user: string; password: string; from: string }): Mailer {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    ...smtpTransportOptions(config.host, config.port),
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
  })
  return {
    async send(message) {
      await transport.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      })
    },
  }
}
