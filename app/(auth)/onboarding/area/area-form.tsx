'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { findNearestArea, submitArea } from '@/app/_actions/onboarding'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'
import { errorMessage } from '@/lib/utils/error-messages'

type Area = { code: string; label: string }

export function AreaForm({ areas }: { areas: Area[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string>()
  const [formError, setFormError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLocating, setIsLocating] = useState(false)

  // 位置情報の拒否・失敗（HTTPS未提供のプレビュー環境等）は一覧選択にフォールバックするだけ
  // — 補助機能であり、失敗を握りつぶさず早期リターンする対象ではなく単に「使わない」だけ
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setFormError('この端末では位置情報が使えません')
      return
    }
    setFormError(undefined)
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        // findNearestArea 内の try/catch はRPC呼び出しの失敗しか拾わない。
        // Server Action 自体の呼び出しがネットワーク層で失敗すると reject するため、
        // ここで拾わないと isLocating が true のまま固まる
        try {
          const result = await findNearestArea({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          })
          if (!result.ok) {
            setFormError(errorMessage(result.error))
            return
          }
          setSelected(result.data.areaCode)
        } catch {
          setFormError('位置情報を取得できませんでした。一覧から選んでください')
        } finally {
          setIsLocating(false)
        }
      },
      () => {
        setIsLocating(false)
        setFormError('位置情報を取得できませんでした。一覧から選んでください')
      },
      { timeout: 5000 },
    )
  }

  const featured = areas.slice(0, 6)
  const filtered = useMemo(
    () => (query ? areas.filter((area) => area.label.includes(query)) : featured),
    [areas, featured, query],
  )

  const proceed = async (areaCode?: string) => {
    setFormError(undefined)
    setIsSubmitting(true)
    const result = await submitArea({ areaCode })
    setIsSubmitting(false)
    if (!result.ok) {
      setFormError(errorMessage(result.error))
      return
    }
    router.push('/onboarding/interests')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">現在地から検索</p>
        <Button
          type="button"
          variant="outline"
          disabled={isLocating || isSubmitting}
          onClick={useCurrentLocation}
        >
          {isLocating ? '取得中…' : '位置情報を使う'}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">よく選ばれるエリア</p>
        <Input
          placeholder="その他のエリアを検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="エリアを検索"
        />
        <div className="flex flex-wrap gap-2">
          {filtered.map((area) => (
            <button
              key={area.code}
              type="button"
              onClick={() => setSelected(area.code)}
              aria-pressed={selected === area.code}
              className={cn(
                'rounded-full border px-4 py-2 text-sm transition-colors',
                selected === area.code
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border-default bg-surface text-foreground hover:bg-muted',
              )}
            >
              {area.label}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <p className="text-sm text-muted-foreground">
          選択済み: {areas.find((area) => area.code === selected)?.label}
        </p>
      )}

      <FieldError>{formError}</FieldError>

      <div className="flex flex-col gap-3">
        <Button
          type="button"
          size="lg"
          disabled={!selected || isSubmitting}
          onClick={() => proceed(selected)}
        >
          次へ
        </Button>
        <Button
          type="button"
          size="lg"
          variant="ghost"
          disabled={isSubmitting}
          onClick={() => proceed(undefined)}
        >
          スキップ
        </Button>
      </div>
    </div>
  )
}
