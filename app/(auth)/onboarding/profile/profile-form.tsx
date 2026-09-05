'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { checkUsernameAvailable, submitProfile } from '@/app/_actions/onboarding'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/utils/error-messages'
import { type ProfileInput, profileSchema } from '@/lib/validators/onboarding'

// /signup/birthdate や /signup/consent へ差し戻された後に戻ってきても
// 入力済みのユーザーネーム・表示名が消えないよう、一時的に sessionStorage へ退避する
const DRAFT_KEY = 'onboarding-profile-draft'

export function ProfileForm() {
  const router = useRouter()
  const [formError, setFormError] = useState<string>()
  const [usernameCheck, setUsernameCheck] = useState<string>()
  const {
    register,
    getValues,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput>({ resolver: zodResolver(profileSchema) })

  useEffect(() => {
    // Safari のプライベートブラウジング等では sessionStorage へのアクセス自体が
    // 例外を投げうる。ここで throw するとコンポーネントごとクラッシュして
    // 画面が真っ白になるため、読み取り・パースの両方を try で包む
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY)
      if (!saved) return
      sessionStorage.removeItem(DRAFT_KEY)
      reset(JSON.parse(saved))
    } catch {
      // 下書きが読めないだけなので無視する（空欄から再入力してもらう）
    }
  }, [reset])

  const onCheckUsername = async () => {
    setUsernameCheck(undefined)
    const username = getValues('username')
    if (!username) return
    const result = await checkUsernameAvailable(username)
    if (!result.ok) {
      setUsernameCheck(errorMessage(result.error))
      return
    }
    setUsernameCheck(
      result.data.available
        ? 'このユーザーネームは使用できます'
        : 'このユーザーネームは既に使われています',
    )
  }

  const redirectTo = (path: string, values: ProfileInput) => {
    // 下書きを保存できなくても遷移自体は必ず行う。入力を1回失う方が、
    // ボタンが無反応になってサインアップが完全に止まるよりはるかにマシ
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values))
    } catch {
      // 容量超過やプライベートブラウジング等。下書きは諦める
    }
    router.push(path)
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined)
    const result = await submitProfile(values)
    if (!result.ok) {
      // タブを閉じる等で生年月日入力を経ずに到達した場合。値を保存してから差し戻す
      if (result.error === 'BIRTHDATE_REQUIRED') {
        redirectTo('/signup/birthdate', values)
        return
      }
      // 未成年で保護者メール未登録（/signup/consent を飛ばした等）はそちらへ差し戻す
      if (result.error === 'CONSENT_REQUIRED') {
        redirectTo('/signup/consent', values)
        return
      }
      setFormError(errorMessage(result.error))
      return
    }
    router.push('/onboarding/area')
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">ユーザーネーム（英数字_）</Label>
        <div className="flex gap-2">
          <Input id="username" placeholder="cafe_lover" {...register('username')} />
          <Button type="button" variant="outline" onClick={onCheckUsername}>
            重複チェック
          </Button>
        </div>
        <p className="text-sm text-subtle">※ あとから変更できません</p>
        {usernameCheck && (
          <output aria-live="polite" className="text-sm text-muted-foreground">
            {usernameCheck}
          </output>
        )}
        <FieldError>{errors.username?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">表示名</Label>
        <Input id="displayName" {...register('displayName')} />
        <FieldError>{errors.displayName?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">ひとこと自己紹介 (省略可能)</Label>
        <Input id="bio" {...register('bio')} />
        <FieldError>{errors.bio?.message}</FieldError>
      </div>

      <FieldError>{formError}</FieldError>

      <Button type="submit" size="lg" disabled={isSubmitting}>
        次へ
      </Button>
    </form>
  )
}
