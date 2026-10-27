import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import type { AiProposal, ChatBlock, QrStyle, RoutingRule } from '@sharry/shared'

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
    locale: text('locale').notNull().default('en'),
    avatarPath: text('avatar_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_username_lower_idx').on(sql`lower(${table.username})`),
    uniqueIndex('users_email_lower_idx').on(sql`lower(${table.email})`),
  ],
)

export const redirectDomains = pgTable(
  'redirect_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostname: text('hostname').notNull(),
    status: text('status').notNull().default('pending'),
    txtToken: text('txt_token').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastError: text('last_error'),
    txtMismatchStreak: integer('txt_mismatch_streak').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('redirect_domains_hostname_lower_idx').on(sql`lower(${table.hostname})`)],
)

export const folders = pgTable(
  'folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => folders.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    icon: text('icon'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('folders_kind_parent_idx').on(table.kind, table.parentId)],
)

export const links = pgTable(
  'links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    redirectDomainId: uuid('redirect_domain_id').references(() => redirectDomains.id, { onDelete: 'set null' }),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    icon: text('icon'),
    slug: text('slug').notNull(),
    destinationUrl: text('destination_url').notNull(),
    title: text('title'),
    description: text('description'),
    redirectType: text('redirect_type').notNull().default('302'),
    status: text('status').notNull().default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    passwordHash: text('password_hash'),
    routingRules: jsonb('routing_rules').$type<RoutingRule[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('links_slug_lower_idx').on(sql`lower(${table.slug})`),
    index('links_user_id_idx').on(table.userId),
    index('links_redirect_domain_id_idx').on(table.redirectDomainId),
    index('links_folder_id_idx').on(table.folderId),
  ],
)

export const linkPasswordAttempts = pgTable(
  'link_password_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    linkId: uuid('link_id')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    visitorId: text('visitor_id').notNull(),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('link_password_attempts_lookup_idx').on(table.linkId, table.visitorId, table.attemptedAt),
    index('link_password_attempts_attempted_at_idx').on(table.attemptedAt),
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
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    icon: text('icon'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tracking_campaigns_user_id_idx').on(table.userId),
    index('tracking_campaigns_folder_id_idx').on(table.folderId),
  ],
)

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    color: text('color').notNull(),
  },
  (table) => [uniqueIndex('tags_kind_name_lower_idx').on(table.kind, sql`lower(${table.name})`)],
)

export const linkTags = pgTable(
  'link_tags',
  {
    linkId: uuid('link_id')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.linkId, table.tagId] }), index('link_tags_tag_id_idx').on(table.tagId)],
)

export const campaignTags = pgTable(
  'campaign_tags',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => trackingCampaigns.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.campaignId, table.tagId] }), index('campaign_tags_tag_id_idx').on(table.tagId)],
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

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    tokenPrefix: text('token_prefix').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('api_keys_user_id_idx').on(table.userId)],
)

export const aiChats = pgTable(
  'ai_chats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('New chat'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ai_chats_user_updated_idx').on(table.userId, table.updatedAt)],
)

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => aiChats.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull().default(''),
    toolName: text('tool_name'),
    toolCallId: text('tool_call_id'),
    proposal: jsonb('proposal').$type<AiProposal>(),
    blocks: jsonb('blocks').$type<ChatBlock[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ai_messages_chat_created_idx').on(table.chatId, table.createdAt)],
)

export const aiUsageEvents = pgTable(
  'ai_usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    feature: text('feature').notNull(),
    model: text('model').notNull().default(''),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ai_usage_events_occurred_idx').on(table.occurredAt)],
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
export type RedirectDomainRecord = typeof redirectDomains.$inferSelect
export type SessionRecord = typeof sessions.$inferSelect
export type ApiKeyRecord = typeof apiKeys.$inferSelect
export type AiChatRecord = typeof aiChats.$inferSelect
export type AiMessageRecord = typeof aiMessages.$inferSelect
