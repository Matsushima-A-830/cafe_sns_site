import {
  Award,
  BookOpen,
  CloudRain,
  Coffee,
  Compass,
  Crown,
  Footprints,
  Gem,
  Heart,
  HeartHandshake,
  Laptop,
  Map as MapIcon,
  MapPinned,
  Medal,
  Moon,
  Newspaper,
  Star,
  Sunrise,
  User,
  Users,
} from 'lucide-react'

// 20バッジ × lucide-react アイコンの対応表（docs/product/pending-items.md B1、決定済み）。
// 「獲得済み/挑戦中/ロック中」はアイコン自体を変えず色・不透明度で差別化する
export const BADGE_ICONS = {
  POST_FIRST: Coffee,
  POST_10: Newspaper,
  POST_50: BookOpen,
  POST_100: Crown,
  AREA_3: Footprints,
  AREA_10: MapPinned,
  AREA_TOKYO_23: MapIcon,
  SCENE_MORNING: Sunrise,
  SCENE_NIGHT: Moon,
  SCENE_SOLO: User,
  SCENE_RAINY: CloudRain,
  SCENE_WORK: Laptop,
  SCENE_EXPLORER: Compass,
  REGULAR_FIRST: Star,
  REGULAR_3: Award,
  REGULAR_5: Medal,
  REGULAR_VIP: Gem,
  COM_10_FOLLOWERS: Users,
  COM_100_LIKES: Heart,
  COM_FIRST_LIKE_GIVEN: HeartHandshake,
} as const satisfies Record<string, typeof Coffee>

export function getBadgeIcon(code: string): typeof Coffee {
  return BADGE_ICONS[code as keyof typeof BADGE_ICONS] ?? Award
}
