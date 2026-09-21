'use client'

import { useId, useState } from 'react'
import { createOfficialPost } from '@/app/_actions/posts-official'
import { ComposerHeader } from '@/components/features/composer/composer-header'
import { useOfficialComposer } from '@/components/features/composer/use-official-composer'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils/cn'

const CLOSURE_TYPE_OPTIONS = [
  { value: 'closed' as const, label: '臨時休業' },
  { value: 'hours_changed' as const, label: '営業時間変更' },
]

/**
 * S_POST_OFFICIAL 臨時休業・営業時間変更（closure）。写真・本文入力は無く、
 * metadata.reason がそのまま posts.body_json になる（app/_actions/posts-official.ts）
 */
export function ClosureForm() {
  const composer = useOfficialComposer('closure')
  const legendId = useId()
  const [closureType, setClosureType] = useState<'closed' | 'hours_changed'>('closed')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [reason, setReason] = useState('')

  if (composer.status === 'loading') {
    return (
      <p aria-busy="true" className="p-8 text-center text-muted-foreground">
        準備しています...
      </p>
    )
  }
  if (composer.status === 'error' || !composer.postId) {
    return (
      <div className="flex flex-col gap-4 p-8">
        <FieldError>{composer.formError ?? '投稿の準備に失敗しました'}</FieldError>
      </div>
    )
  }

  const postId = composer.postId
  const canSubmit = startsOn.length > 0 && endsOn.length > 0 && startsOn <= endsOn

  async function handleSubmit() {
    await composer.submit(() =>
      createOfficialPost({
        officialFormat: 'closure',
        postId,
        metadata: {
          v: 1,
          closure_type: closureType,
          starts_on: startsOn,
          ends_on: endsOn,
          reason: reason.trim(),
        },
      }),
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <ComposerHeader
        title="臨時休業"
        submitLabel="投稿する"
        canSubmit={canSubmit}
        isSubmitting={composer.isSubmitting}
        onCancel={() => history.back()}
        onSubmit={() => void handleSubmit()}
      />

      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6">
        <fieldset className="flex flex-col gap-2">
          <legend id={legendId} className="text-base font-bold text-foreground">
            種類
          </legend>
          <div role="radiogroup" aria-labelledby={legendId} className="flex flex-wrap gap-2">
            {CLOSURE_TYPE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'cursor-pointer rounded-lg border px-4 py-2 text-sm transition-colors',
                  'border-border-default bg-surface text-foreground hover:bg-muted',
                  'has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground',
                )}
              >
                <input
                  type="radio"
                  name="closure-type"
                  className="sr-only"
                  checked={closureType === option.value}
                  onChange={() => setClosureType(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="closure-starts-on">開始</Label>
            <Input
              id="closure-starts-on"
              type="date"
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="closure-ends-on">終了</Label>
            <Input
              id="closure-ends-on"
              type="date"
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
            />
          </div>
        </div>
        {startsOn.length > 0 && endsOn.length > 0 && startsOn > endsOn && (
          <FieldError>終了日は開始日以降にしてください</FieldError>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="closure-reason">理由（任意）</Label>
          <Textarea
            id="closure-reason"
            value={reason}
            maxLength={200}
            placeholder="例: 私用のためお休みさせていただきます"
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <p role="status" className="rounded-md bg-muted px-4 py-2 text-sm text-muted-foreground">
          ⚠ 「行きたい」「お気に入り」に入れているユーザーに通知が届きます
        </p>

        <FieldError>{composer.formError}</FieldError>
      </div>
    </div>
  )
}
