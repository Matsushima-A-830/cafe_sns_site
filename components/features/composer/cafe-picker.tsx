'use client'

import { XIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { searchCafes } from '@/app/_actions/cafes'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ComposerCafe } from '@/types/composer'

/** 打鍵ごとに検索を投げない。文字入力が止まってから引く */
const SEARCH_DEBOUNCE_MS = 300

/**
 * カフェの検索・選択。検索語が空のときはホームエリアのカフェが初期候補として並ぶ
 * （デフォルト効果 — docs/design/wireframes/composer.md）
 */
export function CafePicker({
  selected,
  onSelect,
}: {
  selected: ComposerCafe | null
  onSelect: (cafe: ComposerCafe | null) => void
}) {
  const inputId = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ComposerCafe[]>([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsSearching(true)
    const timer = setTimeout(async () => {
      const result = await searchCafes({ query })
      if (cancelled) return
      setResults(result.ok ? result.data : [])
      setIsSearching(false)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  if (selected) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">どのカフェですか？</p>
        <div className="flex items-center justify-between gap-2 rounded-md border border-border-default bg-muted px-3 py-2">
          <span className="text-sm text-foreground">{selected.name}</span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="rounded-md p-1 text-muted-foreground hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
          >
            <XIcon className="size-4" />
            <span className="sr-only">選択中のカフェを解除</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>どのカフェですか？（任意）</Label>
      <Input
        id={inputId}
        type="search"
        value={query}
        placeholder="カフェを検索・選択"
        onChange={(event) => setQuery(event.target.value)}
      />

      {results.length > 0 && (
        <ul className="flex max-h-56 flex-col overflow-y-auto rounded-md border border-border-default">
          {results.map((cafe) => (
            <li key={cafe.id}>
              <button
                type="button"
                onClick={() => onSelect(cafe)}
                className="flex w-full flex-col items-start gap-1 border-b border-border-default px-3 py-2 text-left last:border-b-0 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
              >
                <span className="text-sm text-foreground">{cafe.name}</span>
                <span className="text-xs text-muted-foreground">{cafe.areaLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {isSearching
          ? '検索中...'
          : results.length === 0 && query.length > 0
            ? '一致するカフェが見つかりませんでした'
            : ''}
      </p>

      {/* 新しいタブで開く: composer の入力（下書き）を失わずに登録できる。
          戻ってきたら検索し直して選択してもらう */}
      <a
        href="/cafes/new"
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-primary underline underline-offset-2"
      >
        見つからない場合はカフェを新規登録
        <span className="sr-only">（新しいタブで開きます）</span>
      </a>
    </div>
  )
}
