'use client'

import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * マイページ中段のタブ切替プレビュー。3レーン（お気に入り / 行きたい / 下書き）の
 * 直近5件を、マイページを離れずに確認できるようにする（ワイヤーのハイブリッドUI）。
 *
 * 3レーンぶんのデータはサーバーで取り切って渡す。タブ切替で取得しないのは、
 * 5件のプレビューのために往復を増やす価値が無いため
 *   docs/design/wireframes/mypage.md #S_MYPAGE
 */

export type PreviewItem = {
  key: string
  href: string
  primary: string
  secondary: string
}

export type PreviewLane = {
  key: string
  label: string
  /** 「すべて見る」の遷移先 */
  href: string
  items: PreviewItem[]
  emptyMessage: string
}

export function ListPreviewTabs({ lanes }: { lanes: PreviewLane[] }) {
  const [activeKey, setActiveKey] = useState(lanes[0]?.key ?? '')
  const active = lanes.find((lane) => lane.key === activeKey) ?? lanes[0]
  if (!active) return null

  return (
    <section className="flex flex-col gap-4">
      <h2 className="sr-only">リストのプレビュー</h2>

      <div
        role="tablist"
        aria-label="リストの切り替え"
        className="flex gap-6 border-b border-border-default"
      >
        {lanes.map((lane) => {
          const isActive = lane.key === active.key
          return (
            <button
              key={lane.key}
              type="button"
              role="tab"
              id={`list-preview-tab-${lane.key}`}
              aria-selected={isActive}
              aria-controls={`list-preview-panel-${lane.key}`}
              onClick={() => setActiveKey(lane.key)}
              className={cn(
                '-mb-px border-b-2 px-2 py-3 text-base focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none',
                isActive
                  ? 'border-primary font-bold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {lane.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`list-preview-panel-${active.key}`}
        aria-labelledby={`list-preview-tab-${active.key}`}
        className="flex flex-col gap-4"
      >
        {active.items.length === 0 ? (
          <p className="rounded-lg border border-border-default bg-surface p-6 text-base text-muted-foreground">
            {active.emptyMessage}
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {active.items.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="flex flex-col gap-1 rounded-lg border border-border-default bg-surface px-4 py-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
                  >
                    <span className="truncate text-base text-foreground">{item.primary}</span>
                    <span className="truncate text-sm text-muted-foreground">{item.secondary}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              href={active.href}
              className="inline-flex items-center gap-1 self-end text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
            >
              {active.label}をすべて見る
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          </>
        )}
      </div>
    </section>
  )
}
