import { env } from '@/lib/env'

/**
 * next/image の最適化対象にできるURLか（＝next.config.ts の remotePatterns に一致するか）。
 *
 * 一致しないURLを next/image にそのまま渡すと「Invalid src prop」で画面ごと落ちる。
 * 本文JSONやプロフィールのURLは外部から差し込まれ得るため、判定して unoptimized に
 * 逃がす（next/image は使い続ける — CLAUDE.md パフォーマンス「画像は必ず next/image」）
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
