'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  refreshConsentStatus,
  resendGuardianConsentEmail,
  updateGuardianEmail,
} from '@/app/_actions/auth'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/utils/error-messages'
import type { Result } from '@/types/result'

export function PendingActions() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [newEmail, setNewEmail] = useState('')

  // 3ハンドラ共通の「エラー表示リセット → 実行 → 失敗ならエラー表示」の骨格をまとめる
  function runAction<T>(action: () => Promise<Result<T>>, onSuccess: (data: T) => void) {
    setError(undefined)
    setMessage(undefined)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
      onSuccess(result.data)
    })
  }

  const handleCheckStatus = () =>
    runAction(refreshConsentStatus, (data) => {
      // active 以外に suspended/deleted も含む。ここでは状態を出し分けず「/」へ送り、
      // middleware に判定を委ねる（suspended→/account/suspended、deleted→/login）
      if (data.status !== 'pending_consent') {
        router.push('/')
        router.refresh()
        return
      }
      setMessage('まだ保護者の同意が確認できていません。しばらくしてから再度お試しください')
    })

  const handleResend = () =>
    runAction(resendGuardianConsentEmail, () => {
      setMessage('確認メールを再送しました')
    })

  const handleUpdateEmail = () =>
    runAction(
      () => updateGuardianEmail(newEmail),
      () => {
        setMessage('新しいメールアドレスに確認メールを送信しました')
        setShowEmailForm(false)
      },
    )

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <Button onClick={handleCheckStatus} disabled={isPending} size="lg" className="w-full">
        状態を確認する
      </Button>

      <Button
        onClick={handleResend}
        disabled={isPending}
        variant="outline"
        size="lg"
        className="w-full"
      >
        再送する
      </Button>

      {showEmailForm ? (
        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="newGuardianEmail">新しい保護者のメールアドレス</Label>
          <Input
            id="newGuardianEmail"
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
          />
          <Button onClick={handleUpdateEmail} disabled={isPending} size="lg" className="w-full">
            送信する
          </Button>
        </div>
      ) : (
        <Button
          onClick={() => setShowEmailForm(true)}
          disabled={isPending}
          variant="outline"
          size="lg"
          className="w-full"
        >
          メールアドレスを変更
        </Button>
      )}

      <p aria-live="polite" className="text-sm text-success">
        {message}
      </p>
      <FieldError>{error}</FieldError>
    </div>
  )
}
