'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { updateCafeBusinessHours } from '@/app/_actions/cafe-business-hours'
import { findSimilarCafes, updateCafe } from '@/app/_actions/cafes'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { DAY_LABELS } from '@/lib/cafes/business-hours'
import type { CafeEditData } from '@/lib/owner/cafe-edit'
import { cn } from '@/lib/utils/cn'
import { errorMessage } from '@/lib/utils/error-messages'
import { type CafeEditFormValues, cafeEditFormSchema } from '@/lib/validators/cafes'
import type { ComposerCafe } from '@/types/composer'

/** 打鍵ごとに類似検索を投げない（cafe-new-form.tsx と同じ間隔） */
const SIMILAR_CHECK_DEBOUNCE_MS = 400

type Area = { code: string; label: string }

const FIELD_LABELS: Record<string, string> = {
  name: '店名',
  nameKana: 'フリガナ',
  prefecture: '都道府県',
  city: '市区町村',
  address: '所在地',
  phone: '電話番号',
  website: 'ウェブサイト',
  description: '店舗説明',
  'externalIds.googlePlaceId': 'Google Places ID',
  'externalIds.tabelogUrl': '食べログURL',
}

function toClock(time: string | null): string | undefined {
  return time ? time.slice(0, 5) : undefined
}

function toDefaultValues(cafe: CafeEditData): CafeEditFormValues {
  return {
    cafeId: cafe.id,
    name: cafe.name,
    nameKana: cafe.nameKana ?? '',
    prefecture: cafe.prefecture,
    city: cafe.city,
    areaCode: cafe.areaCode ?? undefined,
    address: cafe.address ?? '',
    phone: cafe.phone ?? '',
    website: cafe.website ?? '',
    description: cafe.description ?? '',
    externalIds: cafe.externalIds,
    hours: Array.from({ length: 7 }, (_, dayOfWeek) => {
      const hour = cafe.businessHours.find((h) => h.dayOfWeek === dayOfWeek)
      // 営業時間が未登録の曜日は「定休日」を初期値にする。isClosed=false のまま時刻を
      // 空にすると businessHourSchema の refine（定休日でなければ時刻必須）に違反し、
      // 保存前の変更検知モーダルが無言で開かなくなる
      return {
        dayOfWeek,
        isClosed: hour?.isClosed ?? true,
        opensAt: toClock(hour?.opensAt ?? null),
        closesAt: toClock(hour?.closesAt ?? null),
      }
    }),
  }
}

/** 保存前の変更検知サマリー用に「変わった基本情報フィールド」を拾う（ワイヤー注記） */
function diffSummary(
  before: CafeEditFormValues,
  after: CafeEditFormValues,
): { label: string; before: string; after: string }[] {
  const keys: (keyof CafeEditFormValues)[] = [
    'name',
    'nameKana',
    'prefecture',
    'city',
    'address',
    'phone',
    'website',
    'description',
  ]
  const changes = keys
    .filter((key) => (before[key] ?? '') !== (after[key] ?? ''))
    .map((key) => ({
      label: FIELD_LABELS[key] ?? key,
      before: String(before[key] ?? '（未設定）'),
      after: String(after[key] ?? '（未設定）'),
    }))

  const externalKeys = ['googlePlaceId', 'tabelogUrl'] as const
  for (const key of externalKeys) {
    const beforeValue = before.externalIds?.[key] ?? ''
    const afterValue = after.externalIds?.[key] ?? ''
    if (beforeValue !== afterValue) {
      changes.push({
        label: FIELD_LABELS[`externalIds.${key}`] ?? key,
        before: beforeValue || '（未設定）',
        after: afterValue || '（未設定）',
      })
    }
  }

  if (JSON.stringify(before.hours) !== JSON.stringify(after.hours)) {
    changes.push({ label: '営業時間', before: '変更前', after: '変更後' })
  }

  return changes
}

export function CafeEditForm({ cafe, areas }: { cafe: CafeEditData; areas: Area[] }) {
  const areaFieldId = useId()
  const defaultValues = toDefaultValues(cafe)
  const [selectedArea, setSelectedArea] = useState<string | undefined>(defaultValues.areaCode)
  const [formError, setFormError] = useState<string>()
  const [similarCafes, setSimilarCafes] = useState<ComposerCafe[]>([])
  const [pendingValues, setPendingValues] = useState<CafeEditFormValues>()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const {
    register,
    watch,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CafeEditFormValues>({
    resolver: zodResolver(cafeEditFormSchema),
    defaultValues,
  })

  const nameValue = watch('name')

  // 重複防止はブロックせず警告のみ（cafe-new-form.tsx と同じ理由。B9）
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      const query = nameValue?.trim()
      if (!query || query === cafe.name) {
        setSimilarCafes([])
        return
      }
      const result = await findSimilarCafes({ query })
      if (cancelled) return
      setSimilarCafes(result.ok ? result.data.filter((c) => c.id !== cafe.id) : [])
    }, SIMILAR_CHECK_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [nameValue, cafe.name, cafe.id])

  const openConfirm = handleSubmit((values) => {
    setFormError(undefined)
    setPendingValues({ ...values, areaCode: selectedArea })
  })

  const confirmSave = async () => {
    if (!pendingValues) return
    const { hours, ...cafeFields } = pendingValues

    setSaving(true)
    const cafeResult = await updateCafe(cafeFields)
    if (!cafeResult.ok) {
      setSaving(false)
      setPendingValues(undefined)
      setFormError(errorMessage(cafeResult.error))
      return
    }

    const hoursResult = await updateCafeBusinessHours({ cafeId: cafe.id, hours })
    if (!hoursResult.ok) {
      setSaving(false)
      setPendingValues(undefined)
      // 基本情報は既に保存済み。営業時間だけ失敗したことを明示しないと、
      // ユーザーが「何も保存されていない」と誤解して全項目を入力し直してしまう
      setFormError(
        `店舗の基本情報は保存されましたが、営業時間の保存に失敗しました。${errorMessage(hoursResult.error)}`,
      )
      return
    }

    setSaving(false)
    setPendingValues(undefined)
    setSaved(true)
  }

  if (saved) {
    return (
      <div className="flex flex-col gap-4 rounded-md border border-border-default bg-surface p-4">
        <p className="text-foreground">店舗情報を保存しました。</p>
        <a href={`/owner/${cafe.id}`} className="text-sm text-primary underline underline-offset-2">
          ダッシュボードに戻る
        </a>
      </div>
    )
  }

  const changes = pendingValues ? diffSummary(defaultValues, pendingValues) : []

  return (
    <>
      <form onSubmit={openConfirm} className="flex flex-col gap-6" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">店名</Label>
          <Input id="name" {...register('name')} />
          <FieldError>{errors.name?.message}</FieldError>
          {similarCafes.length > 0 && (
            <div className="flex flex-col gap-1 rounded-md border border-border-default bg-muted px-3 py-2">
              <p className="text-sm text-muted-foreground">似た名前の既存カフェがあります</p>
              <ul className="flex flex-col gap-1">
                {similarCafes.map((similar) => (
                  <li key={similar.id} className="text-sm text-foreground">
                    {similar.name}（{similar.areaLabel}）
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="nameKana">フリガナ（任意）</Label>
          <Input id="nameKana" {...register('nameKana')} />
          <FieldError>{errors.nameKana?.message}</FieldError>
        </div>

        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="prefecture">都道府県</Label>
            <Input id="prefecture" {...register('prefecture')} />
            <FieldError>{errors.prefecture?.message}</FieldError>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="city">市区町村</Label>
            <Input id="city" {...register('city')} />
            <FieldError>{errors.city?.message}</FieldError>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={areaFieldId}>エリア（任意）</Label>
          <div id={areaFieldId} className="flex flex-wrap gap-2">
            {areas.map((area) => (
              <button
                key={area.code}
                type="button"
                onClick={() => setSelectedArea(area.code)}
                aria-pressed={selectedArea === area.code}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm transition-colors',
                  selectedArea === area.code
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border-default bg-surface text-foreground hover:bg-muted',
                )}
              >
                {area.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="address">所在地（任意）</Label>
          <Input id="address" {...register('address')} />
          <FieldError>{errors.address?.message}</FieldError>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">電話番号（任意）</Label>
          <Input id="phone" type="tel" {...register('phone')} />
          <FieldError>{errors.phone?.message}</FieldError>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="website">ウェブサイト（任意）</Label>
          <Input id="website" type="url" placeholder="https://" {...register('website')} />
          <FieldError>{errors.website?.message}</FieldError>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="description">店舗説明（任意）</Label>
          <Textarea id="description" {...register('description')} />
          <FieldError>{errors.description?.message}</FieldError>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-bold text-foreground">営業時間</legend>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 7 }, (_, dayOfWeek) => {
              const isClosed = watch(`hours.${dayOfWeek}.isClosed`)
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: dayOfWeek は0〜6固定の曜日そのもの（並び替え無し）
                <div key={dayOfWeek} className="flex flex-col gap-1">
                  {/* flex-wrap: 曜日+開閉時刻(約324px)は390px幅に収まるが、休業スイッチまで
                      1行に収めると416px前後になり横溢れする。折り返して2行目に落とす */}
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-6 text-sm text-foreground">{DAY_LABELS[dayOfWeek]}</span>
                    <Input
                      type="time"
                      disabled={isClosed}
                      className="w-32"
                      aria-label={`${DAY_LABELS[dayOfWeek]}曜日の開店時刻`}
                      {...register(`hours.${dayOfWeek}.opensAt`)}
                    />
                    <span aria-hidden="true">-</span>
                    <Input
                      type="time"
                      disabled={isClosed}
                      className="w-32"
                      aria-label={`${DAY_LABELS[dayOfWeek]}曜日の閉店時刻`}
                      {...register(`hours.${dayOfWeek}.closesAt`)}
                    />
                    <div className="flex items-center gap-2">
                      <Controller
                        name={`hours.${dayOfWeek}.isClosed`}
                        control={control}
                        render={({ field }) => (
                          <Switch
                            id={`closed-${dayOfWeek}`}
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        )}
                      />
                      <Label htmlFor={`closed-${dayOfWeek}`} className="text-sm">
                        休業
                      </Label>
                    </div>
                  </div>
                  <FieldError>{errors.hours?.[dayOfWeek]?.opensAt?.message}</FieldError>
                </div>
              )
            })}
          </div>
          <FieldError>{errors.hours?.message}</FieldError>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="text-sm font-bold text-foreground">外部連携</legend>
          <div className="flex flex-col gap-2">
            <Label htmlFor="googlePlaceId">Google Places ID（任意）</Label>
            <Input id="googlePlaceId" {...register('externalIds.googlePlaceId')} />
            <FieldError>{errors.externalIds?.googlePlaceId?.message}</FieldError>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tabelogUrl">食べログURL（任意）</Label>
            <Input
              id="tabelogUrl"
              type="url"
              placeholder="https://"
              {...register('externalIds.tabelogUrl')}
            />
            <FieldError>{errors.externalIds?.tabelogUrl?.message}</FieldError>
          </div>
        </fieldset>

        <FieldError>{formError}</FieldError>

        <Button type="submit" size="lg" disabled={isSubmitting}>
          保存する
        </Button>
      </form>

      <Dialog open={!!pendingValues} onOpenChange={(open) => !open && setPendingValues(undefined)}>
        <DialogContent>
          <DialogTitle>変更内容を確認</DialogTitle>
          <DialogDescription>
            {changes.length === 0
              ? '基本情報・営業時間に変更はありません。このまま保存しますか？'
              : 'この内容で店舗情報を更新します。'}
          </DialogDescription>
          {changes.length > 0 && (
            <ul className="flex flex-col gap-2">
              {changes.map((change) => (
                <li key={change.label} className="text-sm text-foreground">
                  <span className="font-bold">{change.label}</span>：{change.before} →{' '}
                  {change.after}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                戻る
              </Button>
            </DialogClose>
            <Button type="button" onClick={confirmSave} disabled={saving}>
              保存する
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
