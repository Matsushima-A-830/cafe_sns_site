'use client'

import { CheckIcon } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { useId } from 'react'
import { cn } from '@/lib/utils/cn'
import type { PostVisibility } from '@/types/composer'

const OPTIONS: { value: PostVisibility; label: string; description: string }[] = [
  { value: 'public', label: '公開', description: '誰でも見られます' },
  { value: 'followers', label: 'フォロワーのみ', description: 'フォロワーだけが見られます' },
]

/** posts.visibility（public / followers）。既定は公開（tables.md #posts の DEFAULT と揃える） */
export function VisibilityField({
  value,
  onChange,
}: {
  value: PostVisibility
  onChange: (value: PostVisibility) => void
}) {
  const labelId = useId()

  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className="text-sm font-medium text-foreground">
        公開範囲
      </p>
      <RadioGroup.Root
        aria-labelledby={labelId}
        value={value}
        onValueChange={(next) => onChange(next as PostVisibility)}
        className="flex flex-col gap-2 md:flex-row"
      >
        {OPTIONS.map((option) => (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            className={cn(
              'flex flex-1 flex-col items-start gap-1 rounded-md border px-4 py-2 text-left transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none',
              value === option.value
                ? 'border-primary bg-muted'
                : 'border-border-default bg-surface hover:bg-muted',
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              {/* 選択状態を色だけで伝えない（WCAG 1.4.1 色以外の手がかり） */}
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-4 items-center justify-center rounded-full border',
                  value === option.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border-strong',
                )}
              >
                {value === option.value && <CheckIcon className="size-3" />}
              </span>
              {option.label}
            </span>
            <span className="text-xs text-muted-foreground">{option.description}</span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  )
}
