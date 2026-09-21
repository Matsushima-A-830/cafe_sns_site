'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react'
import { submitArea } from '@/app/_actions/onboarding'
import { updateProfile } from '@/app/_actions/profiles'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils/cn'
import { errorMessage } from '@/lib/utils/error-messages'

type Area = { code: string; label: string }

type InitialProfile = {
  username: string
  displayName: string
  bio: string | null
  areaCode: string | null
}

const BIO_MAX_LENGTH = 160
const DISPLAY_NAME_MAX_LENGTH = 30

/**
 * S_PROFILE_EDIT。username は変更不可のため表示のみ（disabled input）。
 * display_name / bio は updateProfile、ホームエリアは onboarding と同じ submitArea を流用する
 *   docs/design/wireframes/mypage.md #S_PROFILE_EDIT
 */
export function ProfileEditForm({
  initialProfile,
  areas,
}: {
  initialProfile: InitialProfile
  areas: Area[]
}) {
  const router = useRouter()
  const displayNameId = useId()
  const bioId = useId()

  const [displayName, setDisplayName] = useState(initialProfile.displayName)
  const [bio, setBio] = useState(initialProfile.bio ?? '')
  const [areaCode, setAreaCode] = useState(initialProfile.areaCode ?? undefined)
  const [areaQuery, setAreaQuery] = useState('')
  const [error, setError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isDirty =
    displayName.trim() !== initialProfile.displayName ||
    bio.trim() !== (initialProfile.bio ?? '') ||
    (areaCode ?? null) !== initialProfile.areaCode

  // タブを閉じる・リロードする経路での取りこぼしを防ぐ（composer と同じ妥協 —
  // クライアントサイド遷移の離脱は捕捉しない。docs/design/wireframes/mypage.md の
  // 「離脱時: 変更があれば確認ダイアログ」はブラウザ離脱のみで代替する）
  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const featured = areas.slice(0, 6)
  const filtered = useMemo(
    () => (areaQuery ? areas.filter((area) => area.label.includes(areaQuery)) : featured),
    [areas, featured, areaQuery],
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setIsSubmitting(true)

    const profileChanged =
      displayName.trim() !== initialProfile.displayName || bio.trim() !== (initialProfile.bio ?? '')
    const areaChanged = (areaCode ?? null) !== initialProfile.areaCode

    if (profileChanged) {
      const result = await updateProfile({ displayName, bio })
      if (!result.ok) {
        setIsSubmitting(false)
        setError(errorMessage(result.error))
        return
      }
    }

    if (areaChanged) {
      const result = await submitArea({ areaCode })
      if (!result.ok) {
        setIsSubmitting(false)
        setError(errorMessage(result.error))
        return
      }
    }

    setIsSubmitting(false)
    router.push('/me')
    router.refresh()
  }

  const selectedAreaLabel = areas.find((area) => area.code === areaCode)?.label

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">ユーザーネーム</span>
        <Input
          value={`@${initialProfile.username}`}
          disabled
          aria-label="ユーザーネーム（変更不可）"
        />
        <p className="text-sm text-muted-foreground">ユーザーネームは変更できません</p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={displayNameId} className="text-sm font-medium text-foreground">
          表示名
        </label>
        <Input
          id={displayNameId}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          disabled={isSubmitting}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={bioId} className="text-sm font-medium text-foreground">
          自己紹介
        </label>
        <Textarea
          id={bioId}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          maxLength={BIO_MAX_LENGTH}
          disabled={isSubmitting}
        />
        <p className="text-sm text-muted-foreground">
          {bio.trim().length} / {BIO_MAX_LENGTH}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">ホームエリア</p>
        <Input
          placeholder="エリアを検索"
          value={areaQuery}
          onChange={(event) => setAreaQuery(event.target.value)}
          aria-label="エリアを検索"
          disabled={isSubmitting}
        />
        {selectedAreaLabel && (
          <p className="text-sm text-muted-foreground">選択中: {selectedAreaLabel}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {filtered.map((area) => (
            <button
              key={area.code}
              type="button"
              onClick={() => setAreaCode(area.code)}
              aria-pressed={areaCode === area.code}
              disabled={isSubmitting}
              className={cn(
                'rounded-full border px-4 py-2 text-sm transition-colors',
                areaCode === area.code
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border-default bg-surface text-foreground hover:bg-muted',
              )}
            >
              {area.label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="self-start"
          disabled={isSubmitting || areaCode === undefined}
          onClick={() => setAreaCode(undefined)}
        >
          未設定に戻す
        </Button>
      </div>

      <FieldError>{error}</FieldError>

      <Button type="submit" size="lg" disabled={!isDirty || isSubmitting}>
        保存
      </Button>
    </form>
  )
}
