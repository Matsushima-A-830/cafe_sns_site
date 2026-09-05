import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
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

export type AuthClaims = {
  role: 'user' | 'owner' | 'admin' | null
  status: 'active' | 'pending_consent' | 'suspended' | 'deleted' | null
  onboarded: boolean
}

// custom_access_token_hook が JWT の app_metadata に差し込んだ role/status/onboarded を読む。
// user.app_metadata (auth.users.raw_app_meta_data) はフックの出力を反映しないため、
// JWT ペイロードを直接デコードする必要がある。署名検証は getUser() が既に済ませている
function decodeAppMetadataClaims(accessToken: string): AuthClaims {
  const fallback: AuthClaims = { role: null, status: null, onboarded: false }
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return fallback
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const meta = decoded.app_metadata ?? {}
    return {
      role: meta.role ?? null,
      status: meta.status ?? null,
      onboarded: Boolean(meta.onboarded),
    }
  } catch {
    return fallback
  }
}
