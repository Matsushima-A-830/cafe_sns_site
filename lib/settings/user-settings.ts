import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * S_SETTINGS の読み取り。Server Component から直接呼ぶ純粋な読み取りなので
 * Server Actions ではなくここに置く（lib/profiles/public-profile.ts と同じ方針）
 *   supabase/migrations/20260905130100_create_user_settings.sql
 */

type Client = SupabaseClient<Database>

export type FontScale = 'small' | 'normal' | 'large'

export type UserSettings = {
  notifyLike: boolean
  notifyComment: boolean
  notifyFollow: boolean
  useLocation: boolean
  allowRecommendation: boolean
  fontScale: FontScale
}

const SELECT =
  'notify_like, notify_comment, notify_follow, use_location, allow_recommendation, font_scale'

/**
 * profiles 作成時のトリガーで必ず1行作られるため、null は「未ログイン/自分の行が
 * 無い」という想定外の状態としてのみ返す（呼び出し元で500に倒す）
 */
export async function getUserSettings(
  supabase: Client,
  userId: string,
): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select(SELECT)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(`設定の取得に失敗しました: ${error.message}`)
  if (!data) return null

  return {
    notifyLike: data.notify_like,
    notifyComment: data.notify_comment,
    notifyFollow: data.notify_follow,
    useLocation: data.use_location,
    allowRecommendation: data.allow_recommendation,
    // DB 列は text + CHECK 制約。生成型は string までしか絞れないため、
    // 未知の値なら安全側の 'normal' に倒す（表示が崩れるより優先）
    fontScale: isFontScale(data.font_scale) ? data.font_scale : 'normal',
  }
}

function isFontScale(value: string): value is FontScale {
  return value === 'small' || value === 'normal' || value === 'large'
}
