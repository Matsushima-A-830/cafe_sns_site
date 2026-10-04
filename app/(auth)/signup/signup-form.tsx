'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { signUp } from '@/app/_actions/auth'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/utils/error-messages'
import { type SignupInput, signupSchema } from '@/lib/validators/auth'

export function SignupForm() {
  const router = useRouter()
  const [formError, setFormError] = useState<string>()
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { agreedToTerms: false as unknown as true },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined)
    const result = await signUp(values)
    if (!result.ok) {
      setFormError(errorMessage(result.error))
      return
    }
    router.push(`/signup/verify?email=${encodeURIComponent(result.data.email)}`)
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">メールアドレス</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        <FieldError>{errors.email?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">パスワード（8文字以上、英数字混合）</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
        />
        <FieldError>{errors.password?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="passwordConfirm">パスワード（確認）</Label>
        <Input
          id="passwordConfirm"
          type="password"
          autoComplete="new-password"
          {...register('passwordConfirm')}
        />
        <FieldError>{errors.passwordConfirm?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Controller
            name="agreedToTerms"
            control={control}
            render={({ field }) => (
              <Checkbox
                id="agreedToTerms"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
          />
          <Label htmlFor="agreedToTerms">
            <Link href="/terms" className="text-link hover:text-link-hover hover:underline">
              利用規約
            </Link>
            {' と '}
            <Link href="/privacy" className="text-link hover:text-link-hover hover:underline">
              プライバシー
            </Link>
            {' に同意'}
          </Label>
        </div>
        <FieldError>{errors.agreedToTerms?.message}</FieldError>
      </div>

      <FieldError>{formError}</FieldError>

      <Button type="submit" size="lg" disabled={isSubmitting}>
        次へ
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        すでにアカウントをお持ちの方
        <br />
        <Link href="/login" className="text-link hover:text-link-hover hover:underline">
          ログインへ
        </Link>
      </p>
    </form>
  )
}
