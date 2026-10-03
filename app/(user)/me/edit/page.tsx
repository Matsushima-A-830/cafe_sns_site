// S_PROFILE_EDIT: プロフィール編集
// 詳細: docs/design/wireframes/mypage.md#s_profile_editプロフィール編集 / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ProfileEditForm } from '@/components/features/profiles/profile-edit-form'
import { getProfileById } from '@/lib/profiles/public-profile'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'プロフィール編集' }

export default async function ProfileEditPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=%2Fme%2Fedit')

  // home_area_code は公開プロフィール（PUBLIC_COLUMNS）に含まれないため別読み。
  // profiles_select_all は行も列も絞らないが、非公開列を混ぜないよう getProfileById とは
  // 別クエリのまま列を明示する（lib/profiles/public-profile.ts の注記参照）
  const [profile, homeAreaResult, areasResult] = await Promise.all([
    getProfileById(supabase, user.id),
    supabase.from('profiles').select('home_area_code').eq('id', user.id).single(),
    supabase.from('areas').select('code, label').eq('level', 'ward').order('priority', {
      ascending: false,
    }),
  ])
  if (!profile) notFound()

  const homeAreaCode = homeAreaResult.data?.home_area_code ?? null
  const areas = areasResult.data ?? []

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/me"
          className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          ← マイページ
        </Link>
        <h1 className="text-2xl font-bold text-foreground">プロフィール編集</h1>
      </header>

      <ProfileEditForm
        initialProfile={{
          username: profile.username,
          displayName: profile.displayName,
          bio: profile.bio,
          avatarUrl: profile.avatarUrl,
          areaCode: homeAreaCode,
        }}
        areas={areas}
      />
    </div>
  )
}
