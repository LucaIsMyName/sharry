import { z } from 'zod'
import { isSafeHref } from './html.ts'
import { cleanRichText, RICH_TEXT_MAX } from './rich-text.ts'

/**
 * Field types a block can declare. The editor builds its inspector from these,
 * the API validates with the schema derived from them, and new blocks start with their defaults.
 */
export type FieldOption<T extends string = string> = { value: T; label: string }

type FieldBase<K extends string, V> = { kind: K; label: string; help?: string; default: V }

export type TextField = FieldBase<'text', string> & { max: number; multiline?: boolean; placeholder?: string }
export type RichTextField = FieldBase<'richtext', string>
export type UrlField = FieldBase<'url', string> & { shortLinks?: boolean; placeholder?: string }
export type ColorField = FieldBase<'color', string | null>
export type ChoiceField<T extends string = string> = FieldBase<'choice', T> & { options: readonly FieldOption<T>[] }
export type ToggleField = FieldBase<'toggle', boolean>
export type MediaField = FieldBase<'media', string | null> & { accept: 'image' | 'video' }

export type ScalarField = TextField | RichTextField | UrlField | ColorField | ChoiceField | ToggleField | MediaField
export type ListField<I extends Record<string, ScalarField> = Record<string, ScalarField>> = FieldBase<'list', PropsOf<I>[]> & {
  item: I
  itemLabel: string
  min: number
  max: number
}
export type PageField = ScalarField | ListField
export type Fields = Record<string, PageField>

export type PropsOf<F extends Record<string, PageField>> = { [K in keyof F]: F[K]['default'] }

export const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** Constructors with the defaults most blocks want. */
export const field = {
  text: (options: Omit<TextField, 'kind' | 'default'> & { default?: string }): TextField => ({
    kind: 'text',
    default: '',
    ...options,
  }),
  richText: (options: Omit<RichTextField, 'kind' | 'default'> & { default?: string }): RichTextField => ({
    kind: 'richtext',
    default: '',
    ...options,
  }),
  url: (options: Omit<UrlField, 'kind' | 'default'> & { default?: string }): UrlField => ({
    kind: 'url',
    default: '',
    ...options,
  }),
  color: (options: Omit<ColorField, 'kind' | 'default'> & { default?: string | null }): ColorField => ({
    kind: 'color',
    default: null,
    ...options,
  }),
  choice: <T extends string>(options: Omit<ChoiceField<T>, 'kind'>): ChoiceField<T> => ({ kind: 'choice', ...options }),
  toggle: (options: Omit<ToggleField, 'kind' | 'default'> & { default?: boolean }): ToggleField => ({
    kind: 'toggle',
    default: false,
    ...options,
  }),
  media: (options: Omit<MediaField, 'kind' | 'default'>): MediaField => ({ kind: 'media', default: null, ...options }),
  list: <I extends Record<string, ScalarField>>(
    options: Omit<ListField<I>, 'kind' | 'default' | 'min'> & { min?: number; default?: PropsOf<I>[] },
  ): ListField<I> => ({
    kind: 'list',
    min: 0,
    default: [],
    ...options,
  }),
}

export function fieldSchema(spec: PageField): z.ZodTypeAny {
  switch (spec.kind) {
    case 'text':
      return z.string().trim().max(spec.max).default(spec.default)
    case 'richtext':
      return z.string().max(RICH_TEXT_MAX).transform(cleanRichText).default(spec.default)
    case 'url':
      return z
        .string()
        .trim()
        .max(2000)
        .refine(isSafeHref, 'Use a web address, mailto:, tel:, or a path that starts with /')
        .default(spec.default)
    case 'color':
      return z.string().regex(HEX_COLOR, 'Use a color such as #13119b').nullable().default(spec.default)
    case 'choice': {
      const values = spec.options.map((option) => option.value)
      return z
        .string()
        .refine((value) => values.includes(value), 'Choose one of the listed options')
        .default(spec.default)
    }
    case 'toggle':
      return z.boolean().default(spec.default)
    case 'media':
      return z.string().uuid().nullable().default(spec.default)
    case 'list':
      return z.array(propsSchema(spec.item)).min(spec.min).max(spec.max).default(spec.default)
  }
}

/** Missing props take their default, so a field added to a block later does not break saved pages. */
export function propsSchema(fields: Record<string, PageField>): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [name, spec] of Object.entries(fields)) shape[name] = fieldSchema(spec)
  return z.object(shape).default({})
}

export function defaultProps<F extends Record<string, PageField>>(fields: F): PropsOf<F> {
  const props: Record<string, unknown> = {}
  for (const [name, spec] of Object.entries(fields)) props[name] = structuredClone(spec.default)
  return props as PropsOf<F>
}
