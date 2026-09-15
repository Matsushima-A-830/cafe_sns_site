import { env } from '@/lib/env'

/**
 * 自前の Storage が配信する公開URLか（＝next.config.ts の remotePatterns に一致するか）。
 *
 * 用途は2つ。1) 外部ホストの画像を描画しない（本文JSONもプロフィールも API 直叩きで
 * 書き換えられるため、許すと閲覧者のIP・UA・Referer が第三者に渡る）
 * 2) remotePatterns に一致しないURLを next/image に渡すと Invalid src prop で描画が落ちる
 */
const PUBLIC_OBJECT_PREFIX = '/storage/v1/object/public/'

export function isStoragePublicUrl(url: string): boolean {
  try {
    const target = new URL(url)
    const base = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
    return target.origin === base.origin && target.pathname.startsWith(PUBLIC_OBJECT_PREFIX)
  } catch {
    return false
  }
}
