'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils/cn'
import type { ComposerTag } from '@/types/composer'

/** docs/architecture/data-model/tables.md #post_tags の上限（DBトリガーが正） */
const MAX_TAGS = 5

const CATEGORY_LABELS: Record<ComposerTag['category'], string> = {
  occasion: '気分・シーン',
  mood: '雰囲気',
  other: 'こだわり',
}

/**
 * タグ選択。おすすめ枠はオンボーディングで選んだ気分タグ（user_interest_tags）から出す。
 *
 * ワイヤーフレームでは「位置情報より」のおすすめタグだが、tags マスタに area カテゴリは
 * 存在しない（エリアの正は areas マスタ。20260905120400_seed_master_data.sql）。
 * 代わりに本人の気分タグを既定候補として出し、ホームエリア起点のデフォルトは
 * カフェ検索（CafePicker）側が担う
 *   docs/design/wireframes/composer.md
 */
export function TagPicker({
  tags,
  suggestedTagIds,
  selectedTagIds,
  onChange,
}: {
  tags: ComposerTag[]
  suggestedTagIds: string[]
  selectedTagIds: string[]
  onChange: (tagIds: string[]) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  const byId = new Map(tags.map((tag) => [tag.id, tag]))
  const selected = selectedTagIds.map((id) => byId.get(id)).filter((tag) => tag !== undefined)
  const suggestions = suggestedTagIds
    .filter((id) => !selectedTagIds.includes(id))
    .map((id) => byId.get(id))
    .filter((tag) => tag !== undefined)

  const isFull = selectedTagIds.length >= MAX_TAGS

  const add = (tagId: string) => {
    if (isFull || selectedTagIds.includes(tagId)) return
    onChange([...selectedTagIds, tagId])
  }
  const remove = (tagId: string) => onChange(selectedTagIds.filter((id) => id !== tagId))

  return (
    <div className="flex flex-col gap-4">
      {suggestions.length > 0 && !isFull && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">おすすめタグ（あなたの好みから）</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => add(tag.id)}
                className="rounded-full border border-border-default bg-surface px-4 py-2 text-sm text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
              >
                + {tag.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">
          タグ（最大{MAX_TAGS}個）
          {selectedTagIds.length > 0 && ` ・ ${selectedTagIds.length}個選択中`}
        </p>
        <div className="flex flex-wrap gap-2">
          {selected.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => remove(tag.id)}
              className="rounded-full border border-primary bg-primary px-4 py-2 text-sm text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
            >
              #{tag.label} ✕
            </button>
          ))}
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((prev) => !prev)}
            className="rounded-full border border-border-default px-4 py-2 text-sm text-link hover:underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
          >
            {isExpanded ? '閉じる' : '+ タグを追加'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-4 rounded-md border border-default p-4">
          {(['occasion', 'mood', 'other'] as const).map((category) => {
            const inCategory = tags.filter((tag) => tag.category === category)
            if (inCategory.length === 0) return null
            return (
              <div key={category} className="flex flex-col gap-2">
                <p className="text-sm font-medium text-muted-foreground">
                  {CATEGORY_LABELS[category]}
                </p>
                <div className="flex flex-wrap gap-2">
                  {inCategory.map((tag) => {
                    const isSelected = selectedTagIds.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        aria-pressed={isSelected}
                        disabled={!isSelected && isFull}
                        onClick={() => (isSelected ? remove(tag.id) : add(tag.id))}
                        className={cn(
                          'rounded-full border px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border-default bg-surface text-foreground hover:bg-muted',
                        )}
                      >
                        {isSelected ? `✓ ${tag.label}` : tag.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {isFull && (
            <p className="text-sm text-muted-foreground">
              タグは{MAX_TAGS}個までです。入れ替えるには選択中のタグを外してください
            </p>
          )}
        </div>
      )}
    </div>
  )
}
