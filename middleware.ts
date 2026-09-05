import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// docs/architecture/routing.md#middlewarets設計
export async function middleware(request: NextRequest) {
  const { response, user, claims } = await updateSession(request)
  const path = request.nextUrl.pathname

  const isAuthed = user != null
  const role = claims?.role ?? null
  const status = claims?.status ?? null
  const onboarded = claims?.onboarded ?? false

  const redirect = (to: string) => {
    const url = request.nextUrl.clone()
    url.pathname = to
    url.search = ''
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
    path.startsWith('/onboarding')

  if (requiresAuth) {
    if (!isAuthed) return redirect(`/login?next=${encodeURIComponent(path)}`)
    if (status === 'pending_consent' && !path.startsWith('/account/pending')) {
      return redirect('/account/pending')
    }
  }

  // ---- オンボーディング未完了は /onboarding に閉じ込める ----
  if (isAuthed && status === 'active' && !onboarded) {
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
  if ((path === '/login' || path.startsWith('/signup')) && isAuthed && status === 'active') {
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
