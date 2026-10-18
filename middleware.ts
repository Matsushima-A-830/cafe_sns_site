import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { splitPathAndQuery } from '@/lib/utils/split-path-query'

// docs/architecture/routing.md#middlewarets設計
export async function middleware(request: NextRequest) {
  const { response, user, claims } = await updateSession(request)
  const path = request.nextUrl.pathname

  const isAuthed = user != null
  const role = claims?.role ?? null
  const status = claims?.status ?? null
  const onboarded = claims?.onboarded ?? false

  // `to` はパス + クエリ文字列（例: "/login?next=%2Fme"）。url.pathname に丸ごと代入すると
  // "?" や "%" までパーセントエンコードされてしまうため、pathname と search を分けて設定する
  const redirect = (to: string) => {
    const { pathname, search } = splitPathAndQuery(to)
    const url = request.nextUrl.clone()
    url.pathname = pathname
    url.search = search ? `?${search}` : ''
    return NextResponse.redirect(url)
  }

  // ---- 停止・削除アカウントは即座に隔離 ----
  if (isAuthed && status === 'suspended') {
    if (path !== '/account/suspended') return redirect('/account/suspended')
    return response
  }
  if (isAuthed && status === 'deleted') {
    return redirect('/login')
  }

  // ---- 保護されたルート ----
  const requiresAuth =
    path.startsWith('/me') ||
    path.startsWith('/notifications') ||
    path.startsWith('/settings') ||
    path.startsWith('/new') ||
    path.startsWith('/report') ||
    path.startsWith('/cafes/new') ||
    path.startsWith('/onboarding') ||
    path.startsWith('/account') ||
    path.startsWith('/owner/claim') ||
    path === '/owner/pending'

  if (requiresAuth) {
    if (!isAuthed) return redirect(`/login?next=${encodeURIComponent(path)}`)
    // pending_consent でも /onboarding は通す。未成年が同意待ちになるのは
    // submitProfile の時点（オンボーディング1歩目）なので、ここで閉め出すと
    // エリア・気分タグを一生収集できず、onboarded_at も永遠に立たない
    if (
      status === 'pending_consent' &&
      !path.startsWith('/account/pending') &&
      !path.startsWith('/onboarding')
    ) {
      return redirect('/account/pending')
    }
  }

  // ---- オンボーディング未完了は /onboarding に閉じ込める ----
  // suspended/deleted はここに来る前に既に return 済み。
  // status === null は「profiles 行がまだ無い」（OTP確認後・プロフィール作成前）ケースも含む。
  // ここを active のみに絞ると、profiles 行が無いユーザーが /me 等をすり抜けてしまう
  if (isAuthed && status !== 'pending_consent' && !onboarded) {
    if (requiresAuth && !path.startsWith('/onboarding')) {
      return redirect('/onboarding/profile')
    }
  }

  // ---- オーナー限定 ----
  // /new/official は (user) グループ配下だがオーナー権限が要る。列挙は個別に行う
  const isOwnerArea =
    (path.startsWith('/owner') && path !== '/owner/pending' && !path.startsWith('/owner/claim')) ||
    path.startsWith('/new/official')

  if (isOwnerArea) {
    if (!isAuthed) return redirect(`/login?next=${encodeURIComponent(path)}`)
    if (role !== 'owner' && role !== 'admin') return redirect('/')
  }

  // ---- 管理者限定 ----
  if (path.startsWith('/admin') && role !== 'admin') {
    return NextResponse.rewrite(new URL('/not-found', request.url))
  }

  // ---- 既ログイン → /login /signup へのアクセス ----
  // status === 'active' だけを見ると pending_consent（profiles行は既にある）を素通りさせてしまい、
  // /signup/birthdate への再アクセスで age_category が再上書きされて CONSENT_REQUIRED
  // ループに陥る（D73）。suspended/deleted は既に上で弾かれているので、ここでは
  // 「profiles行が存在する（status !== null）」を条件にする
  if ((path === '/login' || path.startsWith('/signup')) && isAuthed && status !== null) {
    if (status === 'pending_consent') return redirect('/account/pending')
    return redirect(onboarded ? '/me' : '/onboarding/profile')
  }

  return response
}

export const config = {
  matcher: [
    /*
     * 静的アセット・画像最適化・favicon は素通しする
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
