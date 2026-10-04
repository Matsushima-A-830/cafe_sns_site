'use client'

import { Heart, MapPin } from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { addCafeToList, removeCafeFromList } from '@/app/_actions/cafe-lists'
import { Button } from '@/components/ui/button'
import { CAFE_LIST_LABELS, type CafeListType } from '@/lib/constants/cafe-lists'
import { errorMessage } from '@/lib/utils/error-messages'

/**
 * カフェ詳細（S_CAFE_DETAIL）の「お気に入り」「行きたい」トグル。
 * 2つは排他ではないので、どちらもそれぞれ独立に付け外しできる
 *   docs/design/wireframes/browsing.md #S_CAFE_DETAIL
 */

const ICONS: Record<CafeListType, typeof Heart> = {
  favorite: Heart,
  want_to_go: MapPin,
}

function ToggleButton({
  cafeId,
  listType,
  initialInList,
  onChanged,
}: {
  cafeId: string
  listType: CafeListType
  initialInList: boolean
  onChanged: (message: string) => void
}) {
  const [inList, setInList] = useState(initialInList)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const label = CAFE_LIST_LABELS[listType]
  const Icon = ICONS[listType]

  function handleClick() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (isPending) return

    // 楽観更新: 失敗時に元に戻すため直前の値を保持
    const previous = inList
    setInList(!previous)
    setError(null)

    startTransition(async () => {
      const result = previous
        ? await removeCafeFromList({ cafeId, listType })
        : await addCafeToList({ cafeId, listType })

      // 既に入っていたなら、押す前の表示が古かっただけなので成功として扱う
      if (!result.ok && result.error !== 'CONFLICT') {
        setInList(previous)
        setError(errorMessage(result.error))
        return
      }
      onChanged(previous ? `${label}から外しました` : `${label}に追加しました`)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={inList ? 'default' : 'outline'}
        size="lg"
        // 色だけで状態を伝えない。ラベルも「済み」に変え、押下状態も併せて渡す
        aria-pressed={inList}
        // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ち、
        // キーボードで押したユーザーは毎回ページ先頭から辿り直すことになる。
        // 連打は handleClick 側の isPending ガードで止める
        aria-busy={isPending}
        onClick={handleClick}
        className="focus-visible:ring-2 focus-visible:ring-ring-focus"
      >
        <Icon aria-hidden="true" />
        {inList ? `${label}済み` : label}
      </Button>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function CafeListButtons({
  cafeId,
  membership,
  isAuthenticated,
}: {
  cafeId: string
  membership: Record<CafeListType, boolean>
  isAuthenticated: boolean
}) {
  // 2つのボタンの結果をまとめて1つの live region で読む（領域を分けると読み上げが競合する）
  const [status, setStatus] = useState('')

  if (!isAuthenticated) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link
          href={`/login?next=${encodeURIComponent(`/cafes/${cafeId}`)}`}
          className="text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus"
        >
          ログイン
        </Link>
        すると「お気に入り」「行きたい」に登録できます。
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <ToggleButton
          cafeId={cafeId}
          listType="favorite"
          initialInList={membership.favorite}
          onChanged={setStatus}
        />
        <ToggleButton
          cafeId={cafeId}
          listType="want_to_go"
          initialInList={membership.want_to_go}
          onChanged={setStatus}
        />
      </div>

      <p aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  )
}
