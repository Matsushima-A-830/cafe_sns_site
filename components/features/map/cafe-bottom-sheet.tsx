'use client'

import { X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getCafeListMembershipForCafe } from '@/app/_actions/cafe-lists'
import { CafeListButtons } from '@/components/features/cafes/cafe-list-buttons'
import type { NearbyCafe } from '@/lib/cafes/nearby'
import type { CafeListType } from '@/lib/constants/cafe-lists'
import { estimateWalkMinutes } from '@/lib/utils/walking-time'

const NO_MEMBERSHIP: Record<CafeListType, boolean> = { favorite: false, want_to_go: false }

/**
 * マーカータップで開く詳細シート（S_MAP）。ワイヤーは「行きたい」ボタンのみ描くが、
 * 既存の CafeListButtons（お気に入り+行きたい、S_CAFE_DETAIL と共通）をそのまま再利用する。
 * 1ボタンだけの専用コンポーネントを新設するより、実績のあるトグルロジックを使い回す方が
 * バグを増やさない
 */
export function CafeBottomSheet({
  cafe,
  isAuthenticated,
  onClose,
  onShowList,
}: {
  cafe: NearbyCafe
  isAuthenticated: boolean
  onClose: () => void
  onShowList: () => void
}) {
  const [membership, setMembership] = useState<Record<CafeListType, boolean>>(NO_MEMBERSHIP)

  useEffect(() => {
    setMembership(NO_MEMBERSHIP)
    if (!isAuthenticated) return

    let cancelled = false
    getCafeListMembershipForCafe({ cafeId: cafe.cafeId }).then((result) => {
      if (!cancelled && result.ok) setMembership(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [cafe.cafeId, isAuthenticated])

  return (
    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 rounded-t-lg border border-border-default bg-surface p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-foreground">
            {cafe.name}
            {cafe.isVerified && <span className="ml-2 text-xs text-primary">✓公式</span>}
          </p>
          <p className="text-sm text-muted-foreground">
            {cafe.areaLabel ?? 'エリア未設定'} ・ 徒歩{estimateWalkMinutes(cafe.distanceM)}分
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring-focus"
        >
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/cafes/${cafe.cafeId}`}
          className="text-sm text-primary underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring-focus"
        >
          詳細へ
        </Link>
        <CafeListButtons
          cafeId={cafe.cafeId}
          membership={membership}
          isAuthenticated={isAuthenticated}
        />
      </div>

      <button
        type="button"
        onClick={onShowList}
        className="text-sm text-muted-foreground underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring-focus"
      >
        一覧で見る
      </button>
    </div>
  )
}
