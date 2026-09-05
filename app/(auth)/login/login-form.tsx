'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { logIn } from '@/app/_actions/auth'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/utils/error-messages'
import { safeRedirectPath } from '@/lib/utils/safe-redirect'
import { type LoginInput, loginSchema } from '@/lib/validators/auth'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [formError, setFormError] = useState<string>()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined)
    const result = await logIn(values)
    if (!result.ok) {
      setFormError(errorMessage(result.error))
      return
    }
    router.push(safeRedirectPath(searchParams.get('next')))
    router.refresh()
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">メールアドレス</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        <FieldError>{errors.email?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">パスワード</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        <FieldError>{errors.password?.message}</FieldError>
      </div>

      <FieldError>{formError}</FieldError>

      <Button type="submit" size="lg" disabled={isSubmitting}>
        ログイン
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        アカウントをお持ちでない方
        <br />
        <Link href="/signup" className="text-link hover:text-link-hover hover:underline">
          新規登録へ
        </Link>
      </p>
    </form>
  )
}
