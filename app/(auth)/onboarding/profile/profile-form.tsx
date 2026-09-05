'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { checkUsernameAvailable, submitProfile } from '@/app/_actions/onboarding'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/utils/error-messages'
import { type ProfileInput, profileSchema } from '@/lib/validators/onboarding'

export function ProfileForm() {
  const router = useRouter()
  const [formError, setFormError] = useState<string>()
  const [usernameCheck, setUsernameCheck] = useState<string>()
  const {
    register,
    getValues,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput>({ resolver: zodResolver(profileSchema) })

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

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined)
    const result = await submitProfile(values)
    if (!result.ok) {
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
