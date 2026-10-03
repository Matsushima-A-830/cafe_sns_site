'use client'

import { Loader2Icon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { submitArea } from '@/app/_actions/onboarding'
import { updateProfile } from '@/app/_actions/profiles'
import { ProfileAvatar } from '@/components/features/profiles/profile-avatar'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { deleteUnsavedAvatarFile, uploadAvatar } from '@/lib/storage/avatar-client'
import { cn } from '@/lib/utils/cn'
import { errorMessage } from '@/lib/utils/error-messages'

type Area = { code: string; label: string }

type InitialProfile = {
  username: string
  displayName: string
  bio: string | null
  avatarUrl: string | null
  areaCode: string | null
}

const BIO_MAX_LENGTH = 160
const DISPLAY_NAME_MAX_LENGTH = 30

/**
 * S_PROFILE_EDIT。username は変更不可のため表示のみ（disabled input）。
 * display_name / bio / avatar_url は updateProfile、ホームエリアは onboarding と同じ
 * submitArea を流用する。アバター削除（未設定に戻す）はワイヤーに無いためスコープ外
 *   docs/design/wireframes/mypage.md #S_PROFILE_EDIT
 *   docs/product/pending-items.md D45
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
  const avatarInputId = useId()
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState(initialProfile.displayName)
  const [bio, setBio] = useState(initialProfile.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatarUrl)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string>()
  // uploadAvatar は選択した時点で直PUTする。保存前に選び直す・画面を離れると
  // 直前のアップロードが孤立するため、上書き・離脱のどちらでも削除する（D64）
  const pendingAvatarPathRef = useRef<string | null>(null)
  const [areaCode, setAreaCode] = useState(initialProfile.areaCode ?? undefined)
  const [areaQuery, setAreaQuery] = useState('')
  const [error, setError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isDirty =
    displayName.trim() !== initialProfile.displayName ||
    bio.trim() !== (initialProfile.bio ?? '') ||
    avatarUrl !== initialProfile.avatarUrl ||
    (areaCode ?? null) !== initialProfile.areaCode

  async function onAvatarSelected(file: File | undefined) {
    // 同じファイルを選び直せるよう、読み取り後すぐ input を空に戻す
    if (avatarInputRef.current) avatarInputRef.current.value = ''
    if (!file) return

    setAvatarError(undefined)
    setIsUploadingAvatar(true)
    const result = await uploadAvatar(file)
    setIsUploadingAvatar(false)
    if (!result.ok) {
      setAvatarError(errorMessage(result.error))
      return
    }

    // 選び直し: 直前のアップロードが保存済みの avatar_url でなければ孤立するため削除する
    const supersededPath = pendingAvatarPathRef.current
    pendingAvatarPathRef.current = result.data.path
    setAvatarUrl(result.data.publicUrl)
    if (supersededPath) void deleteUnsavedAvatarFile(supersededPath)
  }

  // 保存せずに画面を離れた場合、保存されなかったアップロードを削除する（D64）
  useEffect(() => {
    return () => {
      if (pendingAvatarPathRef.current) void deleteUnsavedAvatarFile(pendingAvatarPathRef.current)
    }
  }, [])

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

    const avatarChanged = avatarUrl !== initialProfile.avatarUrl
    const profileChanged =
      displayName.trim() !== initialProfile.displayName ||
      bio.trim() !== (initialProfile.bio ?? '') ||
      avatarChanged
    const areaChanged = (areaCode ?? null) !== initialProfile.areaCode

    if (profileChanged) {
      // アバター削除（null に戻す）はスコープ外のため、avatarUrl が null になることは無い
      const result = await updateProfile({
        displayName,
        bio,
        ...(avatarChanged && avatarUrl ? { avatarUrl } : {}),
      })
      if (!result.ok) {
        setIsSubmitting(false)
        setError(errorMessage(result.error))
        return
      }
      // 保存済みになったので、離脱時クリーンアップ（孤立ファイル削除）の対象から外す
      if (avatarChanged) pendingAvatarPathRef.current = null
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
        <span className="text-sm font-medium text-foreground">プロフィール画像</span>
        <div className="flex items-center gap-4">
          <div className="relative">
            <ProfileAvatar avatarUrl={avatarUrl} displayName={displayName} />
            {isUploadingAvatar && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-brown-900/40">
                <Loader2Icon
                  aria-hidden="true"
                  className="size-6 animate-spin text-primary-foreground motion-reduce:animate-none"
                />
                <span className="sr-only">アップロード中</span>
              </span>
            )}
          </div>
          <label
            htmlFor={avatarInputId}
            className={cn(
              'cursor-pointer rounded-md border border-border-default bg-surface px-4 py-2 text-sm text-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-ring-focus',
              (isSubmitting || isUploadingAvatar) && 'pointer-events-none opacity-50',
            )}
          >
            変更
          </label>
          <input
            ref={avatarInputRef}
            id={avatarInputId}
            type="file"
            accept="image/*"
            disabled={isSubmitting || isUploadingAvatar}
            className="sr-only"
            onChange={(event) => void onAvatarSelected(event.target.files?.[0])}
          />
        </div>
        <FieldError>{avatarError}</FieldError>
      </div>

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
