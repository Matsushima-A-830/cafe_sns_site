'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { submitArea } from '@/app/_actions/onboarding'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'
import { errorMessage } from '@/lib/utils/error-messages'

type Area = { code: string; label: string }

// A3: areas.center_location が未収集のため「現在地から検索」は未実装。
// 一覧からの選択のみ（docs/product/pending-items.md A3）
export function AreaForm({ areas }: { areas: Area[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string>()
  const [formError, setFormError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)

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
