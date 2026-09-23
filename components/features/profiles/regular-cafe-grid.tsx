import Link from 'next/link'
import type { RegularCafeEntry } from '@/lib/profiles/regulars'
import { formatPostDate } from '@/lib/utils/format-date'

/**
 * 「行きつけ」カードのグリッド。取消導線はユーザー側に無い（オーナー専用操作）ため
 * CafeListView と違い純粋な表示のみで、クライアントコンポーネントにしない。
 * サムネイルは出さない（D31: cafes.main_image_path に値が入る経路が無い）
 *   docs/design/wireframes/mypage.md #S_MYPAGE / browsing.md #S_USER_PROFILE_PUBLIC他人のプロフィール
 */
export function RegularCafeGrid({
  entries,
  emptyMessage,
}: {
  entries: RegularCafeEntry[]
  emptyMessage: string
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-border-default bg-surface p-6 text-base text-muted-foreground">
        {emptyMessage}
      </p>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {entries.map((entry) => (
        <li key={entry.cafeId}>
          <Link
            href={`/cafes/${entry.cafeId}`}
            className="flex flex-col gap-2 rounded-lg border border-border-default bg-surface p-4 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
          >
            <span className="w-fit rounded-full bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">
              常連
            </span>
            <span className="truncate text-base text-foreground">{entry.name}</span>
            {entry.areaLabel && (
              <span className="truncate text-sm text-muted-foreground">{entry.areaLabel}</span>
            )}
            <span className="text-xs text-subtle">認定: {formatPostDate(entry.awardedAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
