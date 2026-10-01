import { type NextRequest, NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/anon'

/**
 * 保護者が同意メールのリンクをクリックしたときの着地点。ブラウザの通常ナビゲーション
 * （＝GET）で、承認は anon から呼べる RPC が担う
 *   supabase/migrations/20260927010000_add_guardian_consent_token.sql
 *   docs/architecture/routing.md GET /api/consent/confirm
 *
 * リクエストのcookieを見る通常クライアント（lib/supabase/server.ts）は使わない。
 * 家族共有端末や保護者自身のログイン中セッションが残っていると、
 * guard_privileged_profile_columns トリガーが「本人がstatusを変えようとした」と
 * 誤認してFORBIDDENを返し、有効なトークンでも承認できなくなる（コードレビューで発覚）
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const redirectTo = new URL('/account/pending', request.url)

  if (!token) {
    redirectTo.searchParams.set('consent', 'invalid')
    return NextResponse.redirect(redirectTo)
  }

  const supabase = createAnonClient()
  const { data, error } = await supabase.rpc('approve_guardian_consent', { p_token: token })

  redirectTo.searchParams.set('consent', !error && data ? 'success' : 'invalid')
  return NextResponse.redirect(redirectTo)
}
