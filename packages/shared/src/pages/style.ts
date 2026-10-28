import { HEX_COLOR, type FieldOption } from './fields.ts'
import { escapeHtml } from './html.ts'

/** Fixed scales so every page stays consistent. Blocks offer these as choices instead of free numbers. */
export const spacing = { none: '0', sm: '16px', md: '32px', lg: '64px', xl: '96px' } as const
export type Spacing = keyof typeof spacing
export const spacingOptions: readonly FieldOption<Spacing>[] = [
  { value: 'none', label: 'None' },
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
]

export const radius = { none: '0', sm: '6px', md: '12px', lg: '24px', full: '999px' } as const
export type Radius = keyof typeof radius
export const radiusOptions: readonly FieldOption<Radius>[] = [
  { value: 'none', label: 'Square' },
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'full', label: 'Pill' },
]

export const fonts = {
  inherit: 'inherit',
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif',
} as const
export type Font = keyof typeof fonts
export const fontOptions: readonly FieldOption<Font>[] = [
  { value: 'inherit', label: 'Page font' },
  { value: 'sans', label: 'Sans serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' },
  { value: 'rounded', label: 'Rounded' },
]

export type Align = 'left' | 'center' | 'right'
export const alignOptions: readonly FieldOption<Align>[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]
export const justify: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }

export const textSizes = { sm: '0.875rem', md: '1rem', lg: '1.25rem', xl: '1.5rem' } as const
export type TextSize = keyof typeof textSizes
export const textSizeOptions: readonly FieldOption<TextSize>[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Normal' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
]

/** A stored color, or null when it is not a valid hex value. */
export function color(value: string | null | undefined): string | null {
  return value && HEX_COLOR.test(value) ? value : null
}

/** Build a style attribute from declarations. Empty values are skipped and the result is escaped. */
export function styleAttr(declarations: Record<string, string | null | undefined | false>): string {
  const css = Object.entries(declarations)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '')
    .map(([property, value]) => `${property}:${value}`)
    .join(';')
  return css ? ` style="${escapeHtml(css)}"` : ''
}

/** Look up a scale value, falling back when an older page stored a value that no longer exists. */
export function pick<T extends Record<string, string>>(scale: T, key: string, fallback: keyof T): string {
  const values = scale as Record<string, string>
  return values[key] ?? values[fallback as string] ?? ''
}
