import fs from 'node:fs'
import path from 'node:path'
import cookie from '@fastify/cookie'
import formbody from '@fastify/formbody'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { sql } from 'drizzle-orm'
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify'
import type pg from 'pg'
import { type Database } from '@sharry/database'
import { isAllowedOrigin, type RuntimeEnv } from '@sharry/shared'
import { bearerToken, isAccountPath } from './api-keys.ts'
import { registerAdminRoutes } from './admin.ts'
import { registerSystemRoutes } from './system.ts'
import { registerAnalyticsRoutes } from './analytics.ts'
import { registerAuthRoutes, requireUser } from './auth.ts'
import { registerLinkRoutes } from './links.ts'
import type { Mailer } from './mail.ts'
import { registerQrRoutes } from './qr.ts'
import { recordPendingClick, sendSpa, tryShortLink, isShortLinkPath } from './redirect.ts'
import { isVerifiedRedirectHost, registerRedirectDomainRoutes, requestHostname } from './redirect-domains.ts'
import { getSettings } from './settings-store.ts'
import { AppError, hashToken } from './support.ts'
import { registerAiRoutes } from './ai/chat.ts'
import { registerTrackingRoutes } from './tracking.ts'
import type { ClickDraft } from './analytics.ts'

declare module 'fastify' {
  interface FastifyInstance {
    db: Database
    env: RuntimeEnv
  }
  interface FastifyReply {
    recordClick: ClickDraft | null
  }
}

export type BuildAppOptions = {
  env: RuntimeEnv
  db: Database
  pool: pg.Pool
  mailer?: Mailer | null
  logger?: FastifyServerOptions['logger']
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? {
      level: options.env.NODE_ENV === 'test' ? 'silent' : 'info',
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
    },
    trustProxy: '127.0.0.1',
    bodyLimit: 1024 * 1024,
  })
  app.decorate('db', options.db)
  app.decorate('env', options.env)
  app.decorateReply('recordClick', null)

  await app.register(cookie)
  await app.register(formbody)
  await app.register(helmet, {
    contentSecurityPolicy:
      options.env.NODE_ENV === 'production'
        ? {
            directives: {
              defaultSrc: ["'self'"],
              connectSrc: ["'self'", 'blob:'],
              imgSrc: ["'self'", 'data:', 'blob:'],
              styleSrc: ["'self'", "'unsafe-inline'"],
              scriptSrc: ["'self'"],
            },
          }
        : false,
    crossOriginEmbedderPolicy: false,
  })
  await app.register(rateLimit, { global: false })
  await app.register(multipart, { limits: { fileSize: 512 * 1024, files: 1 } })

  const limitApiKeys = app.rateLimit({
    max: 120,
    timeWindow: '1 minute',
    keyGenerator(request) {
      return hashToken(bearerToken(request) ?? '', options.env.SESSION_SECRET)
    },
  })

  app.addHook('preHandler', async (request, reply) => {
    if (!(await isVerifiedRedirectHost(app.db, requestHostname(request)))) return
    const pathname = request.url.split('?')[0] ?? ''
    const settings = await getSettings(app.db, app.env)
    if (isShortLinkPath(pathname, settings)) return
    return reply.code(404).type('text/plain').send('Not found')
  })

  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/api')) return
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return
    const origin = request.headers.origin
    if (!origin) return
    if (!isAllowedOrigin(origin, options.env.APP_URL, options.env.SHORT_URL_BASE, options.env.NODE_ENV)) {
      throw new AppError(403, 'Request origin is not allowed')
    }
  })
  app.addHook('preHandler', async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? ''
    const token = bearerToken(request)
    if (isAccountPath(pathname)) {
      if (token !== null) throw new AppError(401, 'API keys cannot be used for account routes')
      return
    }
    if (token === null || !pathname.startsWith('/api/')) return
    await limitApiKeys.call(app, request, reply)
  })
  app.addHook('onResponse', async (_request, reply) => {
    await recordPendingClick(app, reply)
  })

  app.get('/health', async () => {
    await options.db.execute(sql`select 1`)
    return { ok: true }
  })

  /**
   * Return the product name used in the dashboard and on password pages.
   * @route GET /api/brand
   * @tag Settings
   * @auth public
   * @response 200 { appName }
   */
  app.get('/api/brand', async () => {
    return { appName: options.env.APP_NAME }
  })

  registerAuthRoutes(app, options.mailer ?? null)
  registerLinkRoutes(app)
  registerTrackingRoutes(app)
  registerAnalyticsRoutes(app)
  registerQrRoutes(app)
  registerAdminRoutes(app)
  registerRedirectDomainRoutes(app)
  registerSystemRoutes(app)
  registerAiRoutes(app)

  if (options.env.NODE_ENV === 'production') {
    const assets = path.resolve(process.cwd(), 'apps/web/dist/assets')
    if (fs.existsSync(assets)) {
      await app.register(fastifyStatic, { root: assets, prefix: '/assets/', decorateReply: false })
    }
    app.get('/test-results.csv', async (request, reply) => {
      await requireUser(app, request, ['full', 'password_change', 'mfa_enroll', 'mfa_challenge'])
      const body = shippedTestResults(process.cwd())
      if (body === null) return reply.code(404).send({ error: 'Not found' })
      return reply.type('text/csv').send(body)
    })
  }

  app.route({
    method: ['GET', 'HEAD', 'POST'],
    url: '/*',
    handler: async (request, reply) => {
      const handled = await tryShortLink(app, request, reply)
      if (handled) return
      if (request.method === 'POST' || request.url.startsWith('/api')) {
        return reply.code(404).send({ error: 'Not found' })
      }
      sendSpa(reply, options.env.NODE_ENV)
    },
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.message, code: error.code })
    }
    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500
    if (statusCode >= 500) request.log.error({ err: error }, 'Unhandled error')
    const message =
      statusCode === 429 ? 'Too many attempts. Try again shortly.' : statusCode >= 500 ? 'Internal server error' : 'Invalid request'
    return reply.code(statusCode).send({ error: message })
  })

  return app
}

export function shippedTestResults(root: string): string | null {
  const file = path.join(root, 'apps/web/dist/test-results.csv')
  if (!fs.existsSync(file)) return null
  return fs.readFileSync(file, 'utf8')
}
