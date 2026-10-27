export const tagKinds = ['link', 'campaign'] as const
export type TagKind = (typeof tagKinds)[number]

export const tagPalette = [
  '#7c6af7',
  '#e85d4c',
  '#2a9d8f',
  '#e9a825',
  '#3b82c4',
  '#c45c9a',
  '#6b8f3a',
  '#e07a3d',
] as const

const tagColorPattern = /^#[0-9a-fA-F]{6}$/

export function isTagColor(value: string): boolean {
  return tagColorPattern.test(value)
}

export function randomTagColor(): string {
  const index = Math.floor(Math.random() * tagPalette.length)
  return tagPalette[index] ?? tagPalette[0]
}

export function tagTextColor(color: string): string {
  const hex = isTagColor(color) ? color.slice(1) : '7c6af7'
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
  return luminance > 0.62 ? '#1a1814' : '#ffffff'
}
