import { z } from 'zod'
import { qrStyleSchema } from './qr.ts'
import { MAX_ROUTING_CONDITIONS, MAX_ROUTING_RULES, MAX_ROUTING_VALUES, ROUTING_FIELDS, ROUTING_OPERATORS } from './routing.ts'
import { ICON_NAMES } from './icons.ts'
import { pageContentSchema, pageSettingsSchema } from './pages/schema.ts'
import { tagKinds } from './tags.ts'
import { UTM_KEYS, emptyUtmPresets, type UtmPresets } from './utm.ts'

export const locales = ['en', 'de'] as const
export const localeSchema = z.enum(locales)
export type Locale = z.infer<typeof localeSchema>

export const updateLocaleSchema = z.object({
  locale: localeSchema,
})

export const destinationSchema = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }, 'Enter a valid http or https URL')

const utmField = z.string().trim().max(200).nullish()

export const utmSchema = z.object(
  Object.fromEntries(UTM_KEYS.map((key) => [key, utmField])) as Record<
    (typeof UTM_KEYS)[number],
    typeof utmField
  >,
)

const utmPresetValue = z.string().trim().min(1).max(80)
export const utmPresetsSchema = z.object(
  Object.fromEntries(UTM_KEYS.map((key) => [key, z.array(utmPresetValue).max(50)])) as Record<
    (typeof UTM_KEYS)[number],
    z.ZodArray<typeof utmPresetValue>
  >,
)

export function parseUtmPresets(value: unknown): UtmPresets {
  const parsed = utmPresetsSchema.safeParse(value)
  return parsed.success ? parsed.data : emptyUtmPresets()
}

export const iconSchema = z.enum(ICON_NAMES)
const optionalIcon = iconSchema.nullable().optional()
const optionalFolderId = z.string().uuid().nullable().optional()
export const tagKindSchema = z.enum(tagKinds)
export const tagColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a color')
const tagEntrySchema = z.union([
  z.string().trim().min(1).max(40),
  z.object({
    name: z.string().trim().min(1).max(40),
    color: tagColorSchema.optional(),
  }),
])
export type TagInput = z.infer<typeof tagEntrySchema>
const tagNames = z.array(tagEntrySchema).max(20)

export const redirectTypeSchema = z.enum(['301', '302', '307', '308'])

const routingValueSchema = z.string().trim().min(1).max(200)

export const routingConditionSchema = z.object({
  field: z.enum(ROUTING_FIELDS),
  operator: z.enum(ROUTING_OPERATORS),
  values: z.array(routingValueSchema).min(1, 'Choose a value').max(MAX_ROUTING_VALUES, 'Choose at most 30 values'),
})

export const routingRulesSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().max(80, 'Use at most 80 characters').optional(),
      destinationUrl: destinationSchema,
      conditions: z
        .array(routingConditionSchema)
        .min(1, 'Add at least one condition')
        .max(MAX_ROUTING_CONDITIONS, 'A route can have at most 30 conditions'),
    }),
  )
  .max(MAX_ROUTING_RULES, 'A link can have at most 50 routes')

const redirectDomainId = z.string().uuid().nullable().optional()

export const createLinkSchema = z.object({
  destinationUrl: destinationSchema,
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  slug: z.string().trim().max(64).optional().or(z.literal('')),
  redirectType: redirectTypeSchema.optional(),
  redirectDomainId,
  expiresAt: z.string().datetime().nullable().optional(),
  password: z.string().min(1).max(200).optional().or(z.literal('')),
  utm: utmSchema.optional(),
  icon: optionalIcon,
  folderId: optionalFolderId,
  tags: tagNames.optional(),
})

export const updateLinkSchema = z.object({
  destinationUrl: destinationSchema.optional(),
  title: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  slug: z.string().trim().max(64).optional().or(z.literal('')),
  redirectType: redirectTypeSchema.optional(),
  redirectDomainId,
  status: z.enum(['active', 'disabled']).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  password: z.string().min(1).max(200).nullable().optional(),
  utm: utmSchema.optional(),
  routingRules: routingRulesSchema.optional(),
  icon: optionalIcon,
  folderId: optionalFolderId,
  tags: tagNames.optional(),
})

export const createRedirectDomainSchema = z.object({
  hostname: z.string().trim().min(1).max(253),
})

export const loginSchema = z.object({
  usernameOrEmail: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
})

export const mfaSchema = z.object({
  code: z.string().trim().min(6).max(32),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
})

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(300),
  newPassword: z.string().min(12).max(200),
})

export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$/, 'Username must be 3-32 letters, digits, underscores, or hyphens')

export const createUserSchema = z.object({
  username: usernameSchema,
  email: z.string().trim().email(),
  password: z.string().min(12).max(200),
  role: z.enum(['admin', 'user']),
})

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
  userId: z.string().uuid(),
})

export const updateUserSchema = z.object({
  role: z.enum(['admin', 'user']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(12).max(200).optional(),
})

const utmOverride = utmSchema.partial()

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  icon: optionalIcon,
  folderId: optionalFolderId,
  tags: tagNames.optional(),
})

export const updateCampaignSchema = createCampaignSchema.partial()

export const createFolderSchema = z.object({
  kind: z.enum(['link', 'campaign', 'media', 'page']),
  name: z.string().trim().min(1).max(80),
  parentId: z.string().uuid().nullable().optional(),
  icon: optionalIcon,
})

export const updateFolderSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  parentId: z.string().uuid().nullable().optional(),
  icon: optionalIcon,
})

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(40),
  kind: tagKindSchema,
  color: tagColorSchema.optional(),
})

export const updateTagSchema = z.object({
  color: tagColorSchema,
})

export const createVariantSchema = z.object({
  linkId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  utm: utmOverride.optional(),
})

export const updateVariantSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  utm: utmOverride.optional(),
})

export const createQrSchema = z.object({
  linkId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  style: qrStyleSchema,
  trackingVariantId: z.string().uuid().nullable().optional(),
  logoMediaId: z.string().uuid().nullable().optional(),
})

export const updateQrSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  style: qrStyleSchema.optional(),
  trackingVariantId: z.string().uuid().nullable().optional(),
  logoMediaId: z.string().uuid().nullable().optional(),
})

export const updateMediaSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  alt: z.string().trim().max(500).nullable().optional(),
  title: z.string().trim().max(200).nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
})

export const PAGE_SLUG_TAKEN_MESSAGE = 'This page address is already in use. Please choose a different slug.'

export const createPageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(64).optional(),
  folderId: z.string().uuid().nullable().optional(),
  redirectDomainId: z.string().uuid().nullable().optional(),
})

export const updatePageSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().max(64).optional(),
  folderId: z.string().uuid().nullable().optional(),
  redirectDomainId: z.string().uuid().nullable().optional(),
  hidden: z.boolean().optional(),
  settings: pageSettingsSchema.optional(),
  content: pageContentSchema.optional(),
})

export type UpdatePageInput = z.infer<typeof updatePageSchema>

export const settingsUpdateSchema = z.object({
  shortUrlPrefix: z.string().min(2).optional(),
  confirmPrefixChange: z.boolean().optional(),
  legacyPrefixEnabled: z.boolean().optional(),
  pagePrefix: z.string().min(2).optional(),
  confirmPagePrefixChange: z.boolean().optional(),
  legacyPagePrefixEnabled: z.boolean().optional(),
  defaultRedirectType: redirectTypeSchema.optional(),
  slugLength: z.number().int().min(4).max(16).optional(),
  analyticsRetentionDays: z.number().int().min(0).max(3650).optional(),
  registrationPolicy: z.literal('closed').optional(),
  sessionTtlHours: z.number().int().min(1).max(24 * 90).optional(),
  defaultQrStyle: qrStyleSchema.optional(),
  mfaRequired: z.boolean().optional(),
  linkSharing: z.boolean().optional(),
  linkSharingAccess: z.enum(['view', 'edit']).optional(),
  linkSharingShowAdmin: z.boolean().optional(),
  linkSharingEditAdmin: z.boolean().optional(),
  smtpHost: z.string().trim().max(253).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpUser: z.string().trim().max(200).optional(),
  smtpPassword: z.string().max(200).optional(),
  emailFrom: z.union([z.string().trim().email(), z.literal('')]).optional(),
  aiProvider: z.union([z.enum(['openai', 'anthropic', 'google', 'mistral', 'openai_compatible']), z.literal('')]).optional(),
  aiModel: z.string().trim().max(120).optional(),
  aiBaseUrl: z.string().trim().max(500).optional(),
  aiApiKey: z.string().max(500).optional(),
  aiApiKeyClear: z.boolean().optional(),
  aiEnabled: z.boolean().optional(),
  utmPresets: utmPresetsSchema.optional(),
})

export type CreateLinkInput = z.infer<typeof createLinkSchema>
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>
