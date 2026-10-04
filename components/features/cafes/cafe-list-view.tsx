'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { removeCafeFromList } from '@/app/_actions/cafe-lists'
import { Button } from '@/components/ui/button'
import type { CafeListEntry } from '@/lib/cafes/user-cafe-lists'
import { CAFE_LIST_LABELS, type CafeListType } from '@/lib/constants/cafe-lists'
import { errorMessage } from '@/lib/utils/error-messages'
import { formatPostDate } from '@/lib/utils/format-date'

/**
 * お気に入り / 行きたいの一覧（S_FAVORITES / S_WANT_TO_GO）。データソース以外は同じなので
 * 1つのコンポーネントを list_type で切り替えて両画面から使う
 *   docs/design/wireframes/mypage.md #S_FAVORITES--S_WANT_TO_GO--S_BOOKMARKS
 *
 * 解除に確認ダイアログを置かないのは、押し間違えてもカフェ詳細から入れ直せる
 * （下書きの削除と違い取り返しがつく）ため
 */
export function CafeListView({
  listType,
  initialEntries,
}: {
  listType: CafeListType
  initialEntries: CafeListEntry[]
}) {
  const [entries, setEntries] = useState(initialEntries)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()

  const label = CAFE_LIST_LABELS[listType]

  function handleRemove(entry: CafeListEntry) {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (isPending) return

    // 楽観更新: 失敗時に元に戻すため直前の一覧を保持
    const previous = entries
    setEntries((current) => current.filter((item) => item.cafeId !== entry.cafeId))
    setError(null)

    startTransition(async () => {
      const result = await removeCafeFromList({ cafeId: entry.cafeId, listType })
      if (!result.ok) {
        setEntries(previous)
        setError(errorMessage(result.error))
        return
      }
      setStatus(`${entry.name}を${label}から外しました`)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 空状態でも live region と role="alert" を消さない。最後の1件を外すと
          entries が空になるため、ここで早期リターンすると「外しました」の読み上げも
          解除に失敗したときのエラーも、描画される前に消える */}
      {entries.length === 0 ? (
        <p className="rounded-lg border border-border-default bg-surface p-6 text-base text-muted-foreground">
          {label}のカフェはまだありません。カフェのページから追加できます。
        </p>
      ) : (
        <ul className="flex flex-col gap-4 lg:grid lg:grid-cols-2">
          {entries.map((entry) => (
            <li
              key={entry.cafeId}
              className="flex items-start gap-4 rounded-lg border border-border-default bg-surface p-4"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link
                  href={`/cafes/${entry.cafeId}`}
                  className="text-base font-bold text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
                >
                  {entry.name}
                </Link>
                {entry.areaLabel && (
                  <p className="text-sm text-muted-foreground">{entry.areaLabel}</p>
                )}
                {entry.note && (
                  <p className="text-sm break-words whitespace-pre-wrap text-foreground">
                    {entry.note}
                  </p>
                )}
                <p className="text-xs text-subtle">追加: {formatPostDate(entry.addedAt)}</p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ち、
                // キーボードで押したユーザーは毎回ページ先頭から辿り直すことになる。
                // 連打は handleRemove 側の isPending ガードで止める
                aria-busy={isPending}
                onClick={() => handleRemove(entry)}
                className="focus-visible:ring-2 focus-visible:ring-ring-focus"
              >
                {/* どのカフェを外すのかがボタン名だけで分かるようにする */}
                <span className="sr-only">{`${entry.name}を${label}から外す`}</span>
                <span aria-hidden="true">外す</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p aria-live="polite" className="sr-only">
        {isPending ? '更新中' : status}
      </p>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
