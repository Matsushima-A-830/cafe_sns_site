'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { submitGuardianConsent } from '@/app/_actions/auth'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/utils/error-messages'
import { type GuardianConsentInput, guardianConsentSchema } from '@/lib/validators/auth'

export function ConsentForm() {
  const router = useRouter()
  const [formError, setFormError] = useState<string>()
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GuardianConsentInput>({
    resolver: zodResolver(guardianConsentSchema),
    defaultValues: { agreed: false as unknown as true },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined)
    const result = await submitGuardianConsent(values)
    if (!result.ok) {
      setFormError(errorMessage(result.error))
      return
    }
    router.push('/onboarding/profile')
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <p className="text-muted-foreground">
        13〜17歳の方は、保護者の方の同意をいただく必要があります。保護者の方に確認メールをお送りします。
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="guardianEmail">保護者のメールアドレス</Label>
        <Input id="guardianEmail" type="email" {...register('guardianEmail')} />
        <FieldError>{errors.guardianEmail?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Controller
            name="agreed"
            control={control}
            render={({ field }) => (
              <Checkbox
                id="agreed"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
          />
          <Label htmlFor="agreed">
            私は上記メールアドレスの所有者から同意を得ることを約束します
          </Label>
        </div>
        <FieldError>{errors.agreed?.message}</FieldError>
      </div>

      <FieldError>{formError}</FieldError>

      <Button type="submit" size="lg" disabled={isSubmitting}>
        同意メールを送信
      </Button>
    </form>
  )
}
