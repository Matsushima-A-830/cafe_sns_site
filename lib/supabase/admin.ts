import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * service_role クライアント。RLS を完全にバイパスするため用途を限定する
 * （例: admin API 経由のリフレッシュトークン失効、初回 admin 昇格スクリプト）。
 * 通常の Server Actions からは使わない — 認可は RLS に委譲する
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
