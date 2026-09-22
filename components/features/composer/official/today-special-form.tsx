'use client'

import { useId, useState } from 'react'
import { createOfficialPost } from '@/app/_actions/posts-official'
import { ComposerHeader } from '@/components/features/composer/composer-header'
import { ImagePicker } from '@/components/features/composer/image-picker'
import { useOfficialComposer } from '@/components/features/composer/use-official-composer'
import { OfficialSummary } from '@/components/features/posts/official-badge'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { textToTiptapDoc } from '@/lib/composer/tiptap'
import { cn } from '@/lib/utils/cn'
import type { ComposerImage } from '@/types/composer'

type ValidUntilOption = 'today' | 'week_end' | 'none'

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/** now の JST 暦日を YYYY-MM-DD で返す（owner/dashboard.ts startOfJstWeek と同じ加算方式） */
function jstDateOnly(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 「〜今週末」＝直近の日曜日（今日が日曜なら今日）の JST 暦日 */
function jstWeekendDateOnly(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS)
  const daysUntilSunday = (7 - jst.getUTCDay()) % 7
  return jstDateOnly(new Date(date.getTime() + daysUntilSunday * 24 * 60 * 60 * 1000))
}

function resolveValidUntil(option: ValidUntilOption, now: Date): string | null {
  if (option === 'today') return jstDateOnly(now)
  if (option === 'week_end') return jstWeekendDateOnly(now)
  return null
}

const VALID_UNTIL_OPTIONS: { value: ValidUntilOption; label: string }[] = [
  { value: 'today', label: '今日のみ' },
  { value: 'week_end', label: '〜今週末' },
  { value: 'none', label: '期限なし' },
]

/** S_POST_OFFICIAL 今日のおすすめ（today_special）。写真1枚推奨・任意入力多め */
export function TodaySpecialForm() {
  const composer = useOfficialComposer('today_special')
  const legendId = useId()
  const [validUntilOption, setValidUntilOption] = useState<ValidUntilOption>('today')
  const [images, setImages] = useState<ComposerImage[]>([])
  const [menuName, setMenuName] = useState('')
  const [price, setPrice] = useState('')
  const [comment, setComment] = useState('')

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
  const canSubmit = menuName.trim().length > 0
  const priceYen = price.trim() === '' ? null : Number(price)

  async function handleSubmit() {
    await composer.submit(() =>
      createOfficialPost({
        officialFormat: 'today_special',
        postId,
        bodyJson: textToTiptapDoc(comment),
        imagePaths: images.map((image) => image.path),
        metadata: {
          v: 1,
          menu_name: menuName.trim(),
          price_yen: priceYen,
          valid_until: resolveValidUntil(validUntilOption, new Date()),
        },
      }),
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <ComposerHeader
        title="今日のおすすめ"
        submitLabel="投稿する"
        canSubmit={canSubmit}
        isSubmitting={composer.isSubmitting}
        onCancel={() => history.back()}
        onSubmit={() => void handleSubmit()}
      />

      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6">
        <fieldset className="flex flex-col gap-2">
          <legend id={legendId} className="text-base font-bold text-foreground">
            有効期限
          </legend>
          <div role="radiogroup" aria-labelledby={legendId} className="flex flex-wrap gap-2">
            {VALID_UNTIL_OPTIONS.map((option) => (
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
                  name="valid-until"
                  className="sr-only"
                  checked={validUntilOption === option.value}
                  onChange={() => setValidUntilOption(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label>写真（1枚推奨）</Label>
          <ImagePicker
            postId={postId}
            images={images}
            onChange={(update) => setImages((prev) => update(prev))}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="today-special-menu-name">メニュー名</Label>
          <Input
            id="today-special-menu-name"
            value={menuName}
            maxLength={60}
            placeholder="例: 季節限定のマロンタルト"
            onChange={(event) => setMenuName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="today-special-price">価格（任意）</Label>
          <Input
            id="today-special-price"
            type="number"
            inputMode="numeric"
            min={0}
            value={price}
            placeholder="¥"
            onChange={(event) => setPrice(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="today-special-comment">一言コメント</Label>
          <Textarea
            id="today-special-comment"
            value={comment}
            maxLength={200}
            placeholder="今週入荷した和栗を使った..."
            onChange={(event) => setComment(event.target.value)}
          />
        </div>

        {menuName.trim() && (
          <div className="flex flex-col gap-2 rounded-lg border border-border-default bg-surface p-4">
            <p className="text-sm text-muted-foreground">プレビュー</p>
            <OfficialSummary
              metadata={{
                format: 'today_special',
                menuName: menuName.trim(),
                priceYen,
                validUntil: resolveValidUntil(validUntilOption, new Date()),
              }}
            />
          </div>
        )}

        <FieldError>{composer.formError}</FieldError>
      </div>
    </div>
  )
}
