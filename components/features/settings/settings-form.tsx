'use client'

import Link from 'next/link'
import { useId, useState, useTransition } from 'react'
import { updateSettings } from '@/app/_actions/settings'
import { Switch } from '@/components/ui/switch'
import type { FontScale, UserSettings } from '@/lib/settings/user-settings'
import { cn } from '@/lib/utils/cn'
import { errorMessage } from '@/lib/utils/error-messages'

const FONT_SCALE_OPTIONS: { value: FontScale; label: string }[] = [
  { value: 'small', label: '小' },
  { value: 'normal', label: '標準' },
  { value: 'large', label: '大' },
]

/**
 * S_SETTINGS のトグル・文字サイズ。項目ごとに押した瞬間に保存する
 * （フォーム全体の送信はしない）。失敗したら該当項目だけ元に戻す
 *   docs/design/wireframes/mypage.md #S_SETTINGS
 */
export function SettingsForm({ initialSettings }: { initialSettings: UserSettings }) {
  const [settings, setSettings] = useState(initialSettings)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fontScaleLabelId = useId()

  // isPending は全項目で共有し、保存中の変更は saveToggle/saveFontScale 冒頭のガードで弾く。
  // 項目ごとに分けると、A保存中にBを変更してAが失敗した際の setSettings(previous) がBの
  // 変更を巻き戻してしまう（previous がクロージャに古いまま残るため）
  function saveToggle(key: keyof Omit<UserSettings, 'fontScale'>, value: boolean) {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (isPending) return

    const previous = settings
    setSettings((current) => ({ ...current, [key]: value }))
    setError(null)

    startTransition(async () => {
      const result = await updateSettings({ [key]: value })
      if (!result.ok) {
        setSettings(previous)
        setError(errorMessage(result.error))
      }
    })
  }

  function saveFontScale(value: FontScale) {
    if (isPending) return

    const previous = settings
    setSettings((current) => ({ ...current, fontScale: value }))
    setError(null)

    startTransition(async () => {
      const result = await updateSettings({ fontScale: value })
      if (!result.ok) {
        setSettings(previous)
        setError(errorMessage(result.error))
      }
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-foreground">プライバシー</h2>
        <div className="flex flex-col gap-4 rounded-lg border border-border-default bg-surface p-4">
          <ToggleRow
            label="位置情報の使用"
            checked={settings.useLocation}
            busy={isPending}
            onCheckedChange={(value) => saveToggle('useLocation', value)}
          />
          <ToggleRow
            label="おすすめ表示に活用"
            checked={settings.allowRecommendation}
            busy={isPending}
            onCheckedChange={(value) => saveToggle('allowRecommendation', value)}
          />
          <Link
            href="/settings/blocked"
            className="flex items-center justify-between py-1 text-base text-foreground focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
          >
            ブロック中のユーザー
            <span aria-hidden="true" className="text-muted-foreground">
              ▶
            </span>
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-foreground">通知</h2>
        <div className="flex flex-col gap-4 rounded-lg border border-border-default bg-surface p-4">
          <ToggleRow
            label="いいね"
            checked={settings.notifyLike}
            busy={isPending}
            onCheckedChange={(value) => saveToggle('notifyLike', value)}
          />
          <ToggleRow
            label="コメント"
            checked={settings.notifyComment}
            busy={isPending}
            onCheckedChange={(value) => saveToggle('notifyComment', value)}
          />
          <ToggleRow
            label="フォロー"
            checked={settings.notifyFollow}
            busy={isPending}
            onCheckedChange={(value) => saveToggle('notifyFollow', value)}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-foreground">表示</h2>
        <div className="flex items-center justify-between rounded-lg border border-border-default bg-surface p-4">
          <span id={fontScaleLabelId} className="text-base text-foreground">
            文字サイズ
          </span>
          <div role="radiogroup" aria-labelledby={fontScaleLabelId} className="flex gap-2">
            {FONT_SCALE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground',
                  'border-border-default bg-surface text-foreground hover:bg-muted has-[:checked]:hover:bg-primary',
                  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring-focus',
                )}
              >
                <input
                  type="radio"
                  name="font-scale"
                  className="sr-only"
                  checked={settings.fontScale === option.value}
                  // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。
                  // 連打は saveFontScale 側の isPending ガードで止める
                  aria-busy={isPending}
                  onChange={() => saveFontScale(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      </section>

      <p aria-live="polite" className="sr-only">
        {isPending ? '保存中' : ''}
      </p>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  busy,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  busy: boolean
  onCheckedChange: (value: boolean) => void
}) {
  const id = useId()

  return (
    <div className="flex items-center justify-between py-1">
      <label htmlFor={id} className="text-base text-foreground">
        {label}
      </label>
      <Switch
        id={id}
        checked={checked}
        // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。
        // 連打は saveToggle 側の isPending ガードで止める
        aria-busy={busy}
        onCheckedChange={onCheckedChange}
        className="focus-visible:ring-2 focus-visible:ring-ring-focus"
      />
    </div>
  )
}
