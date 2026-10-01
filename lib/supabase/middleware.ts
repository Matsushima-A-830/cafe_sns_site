import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { decodeAppMetadataClaims } from '@/lib/supabase/claims'
import type { Database } from '@/types/database'

/**
 * middleware.ts から呼ぶセッション更新ヘルパー。
 * リフレッシュされた Cookie を NextResponse に転記して返す。
 * docs/architecture/routing.md#middlewarets設計
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // getUser() は毎回サーバーに問い合わせてトークンを検証する。
  // getSession() だけだと期限切れトークンでも検知できない
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  return { response, user, claims: session ? decodeAppMetadataClaims(session.access_token) : null }
}
