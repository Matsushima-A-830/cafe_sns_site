import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Server Components / Server Actions 用クライアント。
 * Server Component からは cookies() の set が失敗する（Next.js の制約）ため、
 * その場合は無視する — セッションの実書き込みは middleware が担う。
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Component からの呼び出し。middleware がセッションを更新するため無視してよい
          }
        },
      },
    },
  )
}
