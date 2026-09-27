import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * 保護者が同意メールのリンクをクリックしたときの着地点。ブラウザの通常ナビゲーション
 * （＝GET）で、保護者は未ログインが前提。承認は anon から呼べる RPC が担う
 *   supabase/migrations/20260927010000_add_guardian_consent_token.sql
 *   docs/architecture/routing.md GET /api/consent/confirm
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const redirectTo = new URL('/account/pending', request.url)

  if (!token) {
    redirectTo.searchParams.set('consent', 'invalid')
    return NextResponse.redirect(redirectTo)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('approve_guardian_consent', { p_token: token })

  redirectTo.searchParams.set('consent', !error && data ? 'success' : 'invalid')
  return NextResponse.redirect(redirectTo)
}
