import { z } from 'zod'
import { destinationSchema, redirectTypeSchema, utmSchema } from './schemas.ts'

export const aiProviders = ['openai', 'anthropic', 'google', 'mistral', 'openai_compatible'] as const
export const aiProviderSchema = z.enum(aiProviders)
export type AiProvider = z.infer<typeof aiProviderSchema>

export const aiModelCatalog: Record<Exclude<AiProvider, 'openai_compatible'>, { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { id: 'claude-opus-4-1', label: 'Claude Opus 4.1' },
  ],
  google: [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
  mistral: [
    { id: 'mistral-large-latest', label: 'Mistral Large' },
    { id: 'mistral-medium-latest', label: 'Mistral Medium' },
    { id: 'mistral-small-latest', label: 'Mistral Small' },
  ],
}

export const customAiModel = '__custom__'

export const chatStarters = [
  { id: 'link', label: 'Create a short link', prompt: 'Help me create a short link.' },
  { id: 'campaign', label: 'Create a campaign', prompt: 'Help me create a campaign.' },
  { id: 'analytics', label: 'Analytics report', prompt: 'Give me an analytics report.' },
] as const

export const docSlugs = [
  'signing-in',
  'links',
  'campaigns',
  'analytics',
  'qr-codes',
  'domains',
  'api-keys',
  'users',
  'settings',
  'search',
] as const

export type DocSlug = (typeof docSlugs)[number]

export const proposeLinkSchema = z.object({
  destinationUrl: destinationSchema,
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  slug: z.string().trim().max(64).optional(),
  redirectType: redirectTypeSchema.optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  utm: utmSchema.optional(),
})

export const proposeCampaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  variants: z
    .array(
      z
        .object({
          linkId: z.string().uuid().optional(),
          slug: z.string().trim().min(1).max(64).optional(),
          name: z.string().trim().min(1).max(120),
          utm: utmSchema.optional(),
        })
        .refine((variant) => Boolean(variant.linkId || variant.slug), 'Name the link for this variant.'),
    )
    .max(20)
    .optional(),
})

export const queryAnalyticsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  linkId: z.string().uuid().optional(),
  slug: z.string().trim().min(1).max(64).optional(),
})

export const lookupSchema = z.object({
  query: z.string().trim().min(1).max(200),
})

export const readDocSchema = z.object({
  slug: z.enum(docSlugs),
})

export const sendChatMessageSchema = z.object({
  content: z.string().trim().min(1, 'Enter a message.').max(4000, 'A message can be at most 4000 characters.'),
})

export const aiConnectionTestSchema = z.object({
  aiProvider: aiProviderSchema.optional(),
  aiModel: z.string().trim().max(120).optional(),
  aiBaseUrl: z.string().trim().max(500).optional(),
  aiApiKey: z.string().max(500).optional(),
})

export type AiConnectionTestInput = z.infer<typeof aiConnectionTestSchema>

export const linkFormPrefillSchema = z.object({
  destinationUrl: z.string().trim().max(2000).optional(),
  slug: z.string().trim().max(64).optional(),
  suggested: z.boolean().optional(),
  fromTitle: z.boolean().optional(),
})

export const suggestSlugSchema = z.object({
  destinationUrl: destinationSchema,
  linkId: z.string().uuid().optional(),
})

export const suggestUtmSchema = z.object({
  destinationUrl: destinationSchema,
  placement: z.string().trim().max(200).optional(),
})

export const suggestRoutesSchema = z.object({
  instruction: z.string().trim().min(1, 'Describe the routes.').max(500),
})

export const summarizeAnalyticsSchema = queryAnalyticsSchema

export const suggestVariantsSchema = z.object({
  instruction: z.string().trim().min(1, 'Name the variants.').max(500),
})

export const bulkLinkLimit = 20

export const suggestLinksSchema = z.object({
  urls: z.array(z.string().trim().min(1).max(4096)).min(1).max(bulkLinkLimit),
})

export const analyticsFormPrefillSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  linkId: z.string().uuid().optional(),
})

export const campaignFormPrefillSchema = z.object({
  name: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
})

export const submitLinkFormSchema = z.object({
  destinationUrl: destinationSchema,
  title: z.string().trim().max(200).optional(),
  slug: z.string().trim().max(64).optional(),
  createQr: z.boolean().optional(),
  utmSource: z.string().trim().max(200).optional(),
  utmMedium: z.string().trim().max(200).optional(),
  utmCampaign: z.string().trim().max(200).optional(),
})

export const submitAnalyticsFormSchema = z
  .object({
    scope: z.enum(['all', 'link']),
    linkId: z.string().uuid().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((value) => value.scope === 'all' || Boolean(value.linkId), 'Choose a link.')

export const submitCampaignFormSchema = z.object({
  name: z.string().trim().min(1, 'This campaign is missing a name.').max(120),
  description: z.string().trim().max(2000).optional(),
  linkId: z.string().uuid().optional(),
  variantName: z.string().trim().max(120).optional(),
})

export type ProposeLinkArgs = z.infer<typeof proposeLinkSchema>
export type ProposeCampaignArgs = z.infer<typeof proposeCampaignSchema>

export type AiProposalStatus = 'pending' | 'confirmed' | 'dismissed' | 'failed'

export type AiProposalResult = {
  path?: string
  shortUrl?: string
  error?: string
  name?: string
  variants?: { name: string; id?: string; error?: string }[]
}

export type AiProposal = {
  id: string
  tool: 'propose_link' | 'propose_campaign'
  args: Record<string, unknown>
  status: AiProposalStatus
  result?: AiProposalResult
}

export type ChatFormKind = 'link' | 'analytics' | 'campaign'
export type ChatFormStatus = 'pending' | 'submitted'

export type ChatFormLink = { id: string; title: string | null; slug: string; createdAt?: string }

export type ChatFormResult = {
  path?: string
  shortUrl?: string
  error?: string
  qrCreated?: boolean
  name?: string
  scope?: 'all' | 'link'
  linkId?: string
  from?: string
  to?: string
  totalClicks?: number
  uniqueVisitors?: number
  variants?: { name: string; id?: string; error?: string }[]
}

export type ChatBlock =
  | {
      type: 'form'
      id: string
      form: ChatFormKind
      status: ChatFormStatus
      prefill?: Record<string, unknown>
      links?: ChatFormLink[]
      earliestCreatedAt?: string
      result?: ChatFormResult
    }
  | { type: 'chart'; title: string; series: { date: string; clicks: number }[]; path: string }
  | { type: 'bars'; title: string; rows: { name: string; clicks: number }[]; path: string }
  | { type: 'table'; title: string; columns: string[]; rows: string[][]; path?: string }

export function aiIsAvailable(input: {
  provider: string
  model: string
  baseUrl: string
  apiKeySet: boolean
}): boolean {
  if (!input.apiKeySet || !input.model.trim()) return false
  if (input.provider === 'openai' || input.provider === 'anthropic' || input.provider === 'google' || input.provider === 'mistral') return true
  if (input.provider === 'openai_compatible') return aiBaseUrlError(input.baseUrl) === null
  return false
}

export function aiBaseUrlError(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'An OpenAI-compatible provider needs a base URL.'
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Enter an http or https base URL.'
    return null
  } catch {
    return 'Enter an http or https base URL.'
  }
}

export function openAiCompletionsUrl(baseUrl: string): string {
  const url = new URL(baseUrl.trim())
  const path = url.pathname.replace(/\/$/, '')
  if (!path.endsWith('/chat/completions')) {
    url.pathname = `${path}/chat/completions`
  }
  return url.toString()
}
