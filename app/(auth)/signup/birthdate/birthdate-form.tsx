'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { submitBirthdate } from '@/app/_actions/auth'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/utils/error-messages'

const currentYear = new Date().getFullYear()
const years = Array.from({ length: 100 }, (_, i) => currentYear - i)
const months = Array.from({ length: 12 }, (_, i) => i + 1)
const days = Array.from({ length: 31 }, (_, i) => i + 1)

export function BirthdateForm() {
  const router = useRouter()
  const [formError, setFormError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onSubmit = async (formData: FormData) => {
    setFormError(undefined)
    setIsSubmitting(true)
    const result = await submitBirthdate({
      year: formData.get('year'),
      month: formData.get('month'),
      day: formData.get('day'),
    })
    setIsSubmitting(false)

    if (!result.ok) {
      if (result.error === 'AGE_RESTRICTED') {
        router.push('/signup/blocked')
        return
      }
      setFormError(errorMessage(result.error))
      return
    }

    router.push(result.data.ageCategory === 'minor' ? '/signup/consent' : '/onboarding/profile')
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-6">
      <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">【重要】</p>
        <p>・13歳未満はご登録いただけません</p>
        <p>・13〜17歳は保護者の同意が必要です</p>
        <p>・年齢確認のためのみに利用します</p>
      </div>

      <div className="flex items-end gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="year">年</Label>
          <select
            id="year"
            name="year"
            required
            defaultValue=""
            className="h-10 rounded-md border border-border-input bg-input px-2 text-sm text-foreground"
          >
            <option value="" disabled>
              年
            </option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="month">月</Label>
          <select
            id="month"
            name="month"
            required
            defaultValue=""
            className="h-10 rounded-md border border-border-input bg-input px-2 text-sm text-foreground"
          >
            <option value="" disabled>
              月
            </option>
            {months.map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="day">日</Label>
          <select
            id="day"
            name="day"
            required
            defaultValue=""
            className="h-10 rounded-md border border-border-input bg-input px-2 text-sm text-foreground"
          >
            <option value="" disabled>
              日
            </option>
            {days.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </div>
      </div>

      <FieldError>{formError}</FieldError>

      <Button type="submit" size="lg" disabled={isSubmitting}>
        次へ
      </Button>
    </form>
  )
}
