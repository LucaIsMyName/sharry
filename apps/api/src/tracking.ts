import { desc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { trackingCampaigns, trackingVariants, type Database } from '@sharry/database'
import {
  applyUtm,
  cleanUtm,
  createCampaignSchema,
  createVariantSchema,
  destinationSchema,
  updateCampaignSchema,
  utmConflicts,
  utmSchema,
  type UtmParams,
} from '@sharry/shared'
import { requireUser, type Actor } from './auth.ts'
import { writeAudit } from './audit.ts'
import { getLinkForActor } from './links.ts'
import { AppError, parseBody } from './support.ts'
import { z } from 'zod'

export function registerTrackingRoutes(app: FastifyInstance): void {
  app.post('/api/utm/preview', async (request) => {
    await requireUser(app, request, ['full'])
    const body = parseBody(z.object({ destinationUrl: destinationSchema, utm: utmSchema }), request.body)
    const utm = cleanUtm(body.utm)
    return {
      url: applyUtm(body.destinationUrl, utm),
      conflicts: utmConflicts(body.destinationUrl, utm),
    }
  })

  app.get('/api/campaigns', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const rows = await app.db
      .select()
      .from(trackingCampaigns)
      .where(actor.role === 'admin' ? undefined : eq(trackingCampaigns.userId, actor.id))
      .orderBy(desc(trackingCampaigns.createdAt))
    return { campaigns: rows.map(serializeCampaign) }
  })

  app.post('/api/campaigns', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const body = parseBody(createCampaignSchema, request.body)
    const [created] = await app.db
      .insert(trackingCampaigns)
      .values({ userId: actor.id, name: body.name, description: body.description || null })
      .returning()
    if (!created) throw new AppError(500, 'Could not create the campaign')
    await writeAudit(app.db, {
      actorUserId: actor.id,
      action: 'campaign.created',
      entityType: 'campaign',
      entityId: created.id,
      metadata: { name: created.name },
    })
    return serializeCampaign(created)
  })

  app.get('/api/campaigns/:id', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    const campaign = await getCampaign(app.db, actor, id)
    const variants = await app.db.select().from(trackingVariants).where(eq(trackingVariants.campaignId, campaign.id))
    return { ...serializeCampaign(campaign), variants: variants.map(serializeVariant) }
  })

  app.patch('/api/campaigns/:id', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    const current = await getCampaign(app.db, actor, id)
    const body = parseBody(updateCampaignSchema, request.body)
    const [updated] = await app.db
      .update(trackingCampaigns)
      .set({
        name: body.name ?? current.name,
        description: body.description === undefined ? current.description : body.description || null,
        updatedAt: new Date(),
      })
      .where(eq(trackingCampaigns.id, current.id))
      .returning()
    if (!updated) throw new AppError(404, 'Campaign not found')
    return serializeCampaign(updated)
  })

  app.delete('/api/campaigns/:id', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    const campaign = await getCampaign(app.db, actor, id)
    await app.db.delete(trackingCampaigns).where(eq(trackingCampaigns.id, campaign.id))
    await writeAudit(app.db, {
      actorUserId: actor.id,
      action: 'campaign.deleted',
      entityType: 'campaign',
      entityId: campaign.id,
      metadata: { name: campaign.name },
    })
    return reply.code(204).send()
  })

  app.post('/api/campaigns/:id/variants', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    const campaign = await getCampaign(app.db, actor, id)
    const body = parseBody(createVariantSchema, request.body)
    await getLinkForActor(app.db, actor, body.linkId)
    const utm = cleanUtm(body.utm)
    const [created] = await app.db
      .insert(trackingVariants)
      .values({
        campaignId: campaign.id,
        linkId: body.linkId,
        name: body.name,
        utmSource: utm.utm_source ?? null,
        utmMedium: utm.utm_medium ?? null,
        utmCampaign: utm.utm_campaign ?? null,
        utmId: utm.utm_id ?? null,
        utmTerm: utm.utm_term ?? null,
        utmContent: utm.utm_content ?? null,
      })
      .returning()
    if (!created) throw new AppError(500, 'Could not create the variant')
    return serializeVariant(created)
  })

  app.delete('/api/variants/:id', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    const found = await app.db.select().from(trackingVariants).where(eq(trackingVariants.id, id)).limit(1)
    const variant = found[0]
    if (!variant) throw new AppError(404, 'Variant not found')
    await getCampaign(app.db, actor, variant.campaignId)
    await app.db.delete(trackingVariants).where(eq(trackingVariants.id, variant.id))
    return reply.code(204).send()
  })
}

async function getCampaign(db: Database, actor: Actor, id: string) {
  const found = await appSelect(db, id)
  if (!found || (actor.role !== 'admin' && found.userId !== actor.id)) throw new AppError(404, 'Campaign not found')
  return found
}

async function appSelect(db: Database, id: string) {
  const found = await db.select().from(trackingCampaigns).where(eq(trackingCampaigns.id, id)).limit(1)
  return found[0]
}

function serializeCampaign(row: typeof trackingCampaigns.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function serializeVariant(row: typeof trackingVariants.$inferSelect) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    linkId: row.linkId,
    name: row.name,
    utm: {
      utm_source: row.utmSource,
      utm_medium: row.utmMedium,
      utm_campaign: row.utmCampaign,
      utm_id: row.utmId,
      utm_term: row.utmTerm,
      utm_content: row.utmContent,
    },
    createdAt: row.createdAt.toISOString(),
  }
}

export function variantUtm(row: typeof trackingVariants.$inferSelect): UtmParams {
  return cleanUtm({
    utm_source: row.utmSource,
    utm_medium: row.utmMedium,
    utm_campaign: row.utmCampaign,
    utm_id: row.utmId,
    utm_term: row.utmTerm,
    utm_content: row.utmContent,
  })
}
