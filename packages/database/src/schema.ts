import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { QrStyle } from '@sharry/shared'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('user'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    totpSecretEncrypted: text('totp_secret_encrypted'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_username_lower_idx').on(sql`lower(${table.username})`),
    uniqueIndex('users_email_lower_idx').on(sql`lower(${table.email})`),
  ],
)

export const links = pgTable(
  'links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull(),
    destinationUrl: text('destination_url').notNull(),
    title: text('title'),
    description: text('description'),
    redirectType: text('redirect_type').notNull().default('302'),
    status: text('status').notNull().default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('links_slug_lower_idx').on(sql`lower(${table.slug})`),
    index('links_user_id_idx').on(table.userId),
  ],
)

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const trackingCampaigns = pgTable(
  'tracking_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('tracking_campaigns_user_id_idx').on(table.userId)],
)

export const trackingConfigs = pgTable('tracking_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  linkId: uuid('link_id')
    .notNull()
    .unique()
    .references(() => links.id, { onDelete: 'cascade' }),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  utmId: text('utm_id'),
  utmTerm: text('utm_term'),
  utmContent: text('utm_content'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const trackingVariants = pgTable(
  'tracking_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => trackingCampaigns.id, { onDelete: 'cascade' }),
    linkId: uuid('link_id')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    utmId: text('utm_id'),
    utmTerm: text('utm_term'),
    utmContent: text('utm_content'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tracking_variants_campaign_id_idx').on(table.campaignId),
    index('tracking_variants_link_id_idx').on(table.linkId),
  ],
)

export const qrCodes = pgTable(
  'qr_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    linkId: uuid('link_id')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    trackingVariantId: uuid('tracking_variant_id').references(() => trackingVariants.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    styleConfig: jsonb('style_config').$type<QrStyle>().notNull(),
    logoPath: text('logo_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('qr_codes_link_id_idx').on(table.linkId)],
)

export const clickEvents = pgTable(
  'click_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    linkId: uuid('link_id')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    trackingVariantId: uuid('tracking_variant_id').references(() => trackingVariants.id, {
      onDelete: 'set null',
    }),
    qrCodeId: uuid('qr_code_id').references(() => qrCodes.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    referrer: text('referrer'),
    countryCode: text('country_code'),
    region: text('region'),
    browser: text('browser'),
    operatingSystem: text('operating_system'),
    deviceType: text('device_type'),
    isBot: boolean('is_bot').notNull().default(false),
    anonymousVisitorId: text('anonymous_visitor_id'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    utmId: text('utm_id'),
    utmTerm: text('utm_term'),
    utmContent: text('utm_content'),
  },
  (table) => [
    index('click_events_link_id_occurred_at_idx').on(table.linkId, table.occurredAt),
    index('click_events_occurred_at_idx').on(table.occurredAt),
  ],
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_created_at_idx').on(table.createdAt),
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    scope: text('scope').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
)

export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull().unique(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [index('recovery_codes_user_id_idx').on(table.userId)],
)

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type UserRecord = typeof users.$inferSelect
export type LinkRecord = typeof links.$inferSelect
export type SessionRecord = typeof sessions.$inferSelect
