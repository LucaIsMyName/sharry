export const ICON_NAMES = [
  'Link',
  'Folder',
  'Megaphone',
  'Tag',
  'Globe',
  'Hash',
  'Star',
  'Heart',
  'Bookmark',
  'Flag',
  'Zap',
  'Rocket',
  'Target',
  'Gift',
  'ShoppingBag',
  'Camera',
  'Image',
  'Music',
  'Video',
  'FileText',
  'Newspaper',
  'Mail',
  'MessageSquare',
  'Phone',
  'MapPin',
  'Calendar',
  'Clock',
  'Users',
  'User',
  'Building',
  'Briefcase',
  'PieChart',
  'BarChart3',
  'TrendingUp',
  'QrCode',
  'Share2',
  'Sparkles',
  'Flame',
  'Leaf',
  'Coffee',
  'Plane',
  'Home',
  'Compass',
  'Award',
  'Bell',
  'Box',
] as const

export type IconName = (typeof ICON_NAMES)[number]

export const defaultLinkIcon: IconName = 'Link'
export const defaultFolderIcon: IconName = 'Folder'
export const defaultCampaignIcon: IconName = 'Megaphone'

const iconNameSet = new Set<string>(ICON_NAMES)

export function isIconName(value: string | null | undefined): value is IconName {
  return typeof value === 'string' && iconNameSet.has(value)
}
