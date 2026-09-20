// S_SETTINGS: 設定
// 詳細: docs/design/wireframes/mypage.md#s_settings設定 / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SettingsForm } from '@/components/features/settings/settings-form'
import { getUserSettings } from '@/lib/settings/user-settings'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: '設定' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=%2Fsettings')

  const settings = await getUserSettings(supabase, user.id)
  if (!settings) {
    // profiles 作成時のトリガーで必ず1行作られるはずなので、ここに来るのは想定外
    throw new Error('設定の取得に失敗しました')
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/me"
          className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          ← マイページ
        </Link>
        <h1 className="text-2xl font-bold text-foreground">設定</h1>
      </header>

      <SettingsForm initialSettings={settings} />
    </div>
  )
}
