'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { resendSignupOtp, verifySignupOtp } from '@/app/_actions/auth'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/utils/error-messages'
import { type OtpInput, otpSchema } from '@/lib/validators/auth'

export function VerifyForm({ email }: { email: string }) {
  const router = useRouter()
  const [formError, setFormError] = useState<string>()
  const [resendMessage, setResendMessage] = useState<string>()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OtpInput>({ resolver: zodResolver(otpSchema), defaultValues: { email } })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined)
    const result = await verifySignupOtp(values)
    if (!result.ok) {
      setFormError(errorMessage(result.error))
      return
    }
    router.push('/signup/birthdate')
  })

  const onResend = async () => {
    setResendMessage(undefined)
    const result = await resendSignupOtp(email)
    setResendMessage(result.ok ? '確認コードを再送しました' : errorMessage(result.error))
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <p className="text-sm text-muted-foreground">{email} 宛のコードを入力ください</p>

      <input type="hidden" {...register('email')} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="token">確認コード</Label>
        <Input
          id="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          {...register('token')}
        />
        <FieldError>{errors.token?.message}</FieldError>
      </div>

      <FieldError>{formError}</FieldError>

      <Button type="submit" size="lg" disabled={isSubmitting}>
        認証
      </Button>

      <div className="text-center text-sm">
        <p className="text-muted-foreground">コードが届かない</p>
        <button
          type="button"
          onClick={onResend}
          className="text-link hover:text-link-hover hover:underline"
        >
          再送する
        </button>
        {resendMessage && (
          <output aria-live="polite" className="mt-2 text-muted-foreground">
            {resendMessage}
          </output>
        )}
      </div>
    </form>
  )
}
