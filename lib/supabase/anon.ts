import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * 完全に匿名（cookieを一切見ない）なクライアント。
 *
 * 保護者同意リンクの承認は「誰がこのブラウザで何にログイン中か」に依存してはいけない
 * （家族共有端末・保護者自身が別アカウントでログイン中、等）。`lib/supabase/server.ts` の
 * 通常クライアントはリクエストのcookieを見るため、たまたま何らかのセッションが
 * 残っていると `guard_privileged_profile_columns` トリガーが「本人がstatusを変えようとした」
 * と誤認してFORBIDDENを返してしまう（20260905130000_create_profiles.sql）。
 * `approve_guardian_consent` RPC はこの誤爆を避けるため必ずこちらを使う
 */
export function createAnonClient() {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}
