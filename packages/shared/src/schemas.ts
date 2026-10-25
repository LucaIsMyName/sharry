import { z } from 'zod'
import { qrStyleSchema } from './qr.ts'
import { UTM_KEYS } from './utm.ts'

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

export const redirectTypeSchema = z.enum(['301', '302', '307', '308'])

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
})

export const updateCampaignSchema = createCampaignSchema.partial()

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
})

export const updateQrSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  style: qrStyleSchema.optional(),
  trackingVariantId: z.string().uuid().nullable().optional(),
})

export const settingsUpdateSchema = z.object({
  shortUrlPrefix: z.string().min(2).optional(),
  confirmPrefixChange: z.boolean().optional(),
  legacyPrefixEnabled: z.boolean().optional(),
  defaultRedirectType: redirectTypeSchema.optional(),
  slugLength: z.number().int().min(4).max(16).optional(),
  analyticsRetentionDays: z.number().int().min(0).max(3650).optional(),
  registrationPolicy: z.literal('closed').optional(),
  sessionTtlHours: z.number().int().min(1).max(24 * 90).optional(),
  defaultQrStyle: qrStyleSchema.optional(),
  mfaRequired: z.boolean().optional(),
  smtpHost: z.string().trim().max(253).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpUser: z.string().trim().max(200).optional(),
  smtpPassword: z.string().max(200).optional(),
  emailFrom: z.union([z.string().trim().email(), z.literal('')]).optional(),
})

export type CreateLinkInput = z.infer<typeof createLinkSchema>
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>
