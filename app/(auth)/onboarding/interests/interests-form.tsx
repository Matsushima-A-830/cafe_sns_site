'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { submitInterests } from '@/app/_actions/onboarding'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { cn } from '@/lib/utils/cn'
import { errorMessage } from '@/lib/utils/error-messages'

type Tag = { id: string; label: string; category: 'occasion' | 'mood' }

const MAX_SELECTION = 5
const VISIBLE_COUNT = 9

// 幹A: このステップのみスキップ不可（docs/product/positioning.md 幹A 施策5）
export function InterestsForm({ tags }: { tags: Tag[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<'occasion' | 'mood'>('occasion')
  const [showAll, setShowAll] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [formError, setFormError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const visibleTags = tags.filter((tag) => tag.category === tab)
  const shown = showAll ? visibleTags : visibleTags.slice(0, VISIBLE_COUNT)

  const toggle = (tagId: string) => {
    setSelected((prev) => {
      if (prev.includes(tagId)) return prev.filter((id) => id !== tagId)
      if (prev.length >= MAX_SELECTION) return prev
      return [...prev, tagId]
    })
  }

  const onSubmit = async () => {
    setFormError(undefined)
    setIsSubmitting(true)
    const result = await submitInterests({ tagIds: selected })
    setIsSubmitting(false)
    if (!result.ok) {
      setFormError(errorMessage(result.error))
      return
    }
    router.push('/')
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        選択済み: {selected.length} / {MAX_SELECTION}
      </p>

      <div className="flex border-b border-default" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'occasion'}
          onClick={() => setTab('occasion')}
          className={cn(
            'flex-1 border-b-2 px-4 py-2 text-sm font-medium',
            tab === 'occasion'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground',
          )}
        >
          気分・シーン
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mood'}
          onClick={() => setTab('mood')}
          className={cn(
            'flex-1 border-b-2 px-4 py-2 text-sm font-medium',
            tab === 'mood'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground',
          )}
        >
          雰囲気
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {shown.map((tag) => (
          <button
            key={tag.id}
            type="button"
            aria-pressed={selected.includes(tag.id)}
            onClick={() => toggle(tag.id)}
            disabled={!selected.includes(tag.id) && selected.length >= MAX_SELECTION}
            className={cn(
              'rounded-full border px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              selected.includes(tag.id)
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border-default bg-surface text-foreground hover:bg-muted',
            )}
          >
            {selected.includes(tag.id) ? `✓ ${tag.label}` : tag.label}
          </button>
        ))}
        {!showAll && visibleTags.length > VISIBLE_COUNT && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="rounded-full border border-border-default px-4 py-2 text-sm text-link hover:underline"
          >
            もっと見る ▶
          </button>
        )}
      </div>

      <FieldError>{formError}</FieldError>

      <Button
        type="button"
        size="lg"
        disabled={selected.length === 0 || isSubmitting}
        onClick={onSubmit}
      >
        はじめる！
      </Button>
    </div>
  )
}
