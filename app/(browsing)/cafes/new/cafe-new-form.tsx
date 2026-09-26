'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { createCafe, findSimilarCafes } from '@/app/_actions/cafes'
import {
  type CafeLocation,
  CafeLocationPicker,
} from '@/components/features/cafes/cafe-location-picker'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils/cn'
import { errorMessage } from '@/lib/utils/error-messages'
import { type CreateCafeInput, createCafeSchema } from '@/lib/validators/cafes'
import type { ComposerCafe } from '@/types/composer'

/** 打鍵ごとに類似検索を投げない（cafe-picker.tsx と同じ間隔） */
const SIMILAR_CHECK_DEBOUNCE_MS = 400

type Area = { code: string; label: string }

export function CafeNewForm({ areas }: { areas: Area[] }) {
  const areaFieldId = useId()
  const [selectedArea, setSelectedArea] = useState<string>()
  const [location, setLocation] = useState<CafeLocation | null>(null)
  const [formError, setFormError] = useState<string>()
  const [similarCafes, setSimilarCafes] = useState<ComposerCafe[]>([])
  const [created, setCreated] = useState<{ id: string; name: string }>()
  const {
    register,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateCafeInput>({ resolver: zodResolver(createCafeSchema) })

  const nameValue = watch('name')

  // 重複防止はブロックせず警告のみ（B9: pg_place_id ベースの一意制約は
  // Google Maps 未統合のため今は張れない — docs/product/pending-items.md B9）
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      const query = nameValue?.trim()
      if (!query) {
        setSimilarCafes([])
        return
      }
      const result = await findSimilarCafes({ query })
      if (cancelled) return
      setSimilarCafes(result.ok ? result.data : [])
    }, SIMILAR_CHECK_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [nameValue])

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined)
    const result = await createCafe({
      ...values,
      areaCode: selectedArea,
      lat: location?.lat,
      lng: location?.lng,
    })
    if (!result.ok) {
      setFormError(errorMessage(result.error))
      return
    }
    setCreated({ id: result.data.cafeId, name: values.name })
  })

  if (created) {
    return (
      <div className="flex flex-col gap-4 rounded-md border border-border-default bg-surface p-4">
        <p className="text-foreground">
          「{created.name}」を登録しました。元の画面に戻ってカフェを検索・選択してください。
        </p>
        <a
          href={`/cafes/${created.id}`}
          className="text-sm text-primary underline underline-offset-2"
        >
          登録したカフェのページを見る
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">カフェ名</Label>
        <Input id="name" {...register('name')} />
        <FieldError>{errors.name?.message}</FieldError>
        {similarCafes.length > 0 && (
          <div className="flex flex-col gap-1 rounded-md border border-border-default bg-muted px-3 py-2">
            <p className="text-sm text-muted-foreground">似た名前の既存カフェがあります</p>
            <ul className="flex flex-col gap-1">
              {similarCafes.map((cafe) => (
                <li key={cafe.id} className="text-sm text-foreground">
                  {cafe.name}（{cafe.areaLabel}）
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="nameKana">カナ（任意）</Label>
        <Input id="nameKana" {...register('nameKana')} />
        <FieldError>{errors.nameKana?.message}</FieldError>
      </div>

      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="prefecture">都道府県</Label>
          <Input id="prefecture" placeholder="東京都" {...register('prefecture')} />
          <FieldError>{errors.prefecture?.message}</FieldError>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="city">市区町村</Label>
          <Input id="city" placeholder="渋谷区" {...register('city')} />
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
        <Label htmlFor="address">住所（任意）</Label>
        <Input id="address" {...register('address')} />
        <FieldError>{errors.address?.message}</FieldError>
      </div>

      <CafeLocationPicker value={location} onChange={setLocation} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">電話番号（任意）</Label>
        <Input id="phone" type="tel" {...register('phone')} />
        <FieldError>{errors.phone?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="website">Webサイト（任意）</Label>
        <Input id="website" type="url" placeholder="https://" {...register('website')} />
        <FieldError>{errors.website?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">説明（任意）</Label>
        <Textarea id="description" {...register('description')} />
        <FieldError>{errors.description?.message}</FieldError>
      </div>

      <FieldError>{formError}</FieldError>

      <Button type="submit" size="lg" disabled={isSubmitting}>
        登録する
      </Button>
    </form>
  )
}
