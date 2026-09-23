'use client'

import { type ReactNode, useState } from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * S_BADGES 上部の「バッジ / 制覇マップ」タブ切替。
 * データはサーバーで取り切って渡し、タブ切替はクライアント側の表示切替のみで完結させる
 * （list-preview-tabs.tsx と同じ判断: 往復を増やす価値が無い）
 */

const TABS = [
  { key: 'badges', label: 'バッジ' },
  { key: 'map', label: '制覇マップ' },
] as const

export function BadgeMapTabs({
  badgesPanel,
  mapPanel,
}: {
  badgesPanel: ReactNode
  mapPanel: ReactNode
}) {
  const [activeKey, setActiveKey] = useState<(typeof TABS)[number]['key']>('badges')

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="バッジ・制覇マップの切り替え"
        className="flex gap-6 border-b border-border-default"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeKey
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`badge-map-tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`badge-map-panel-${tab.key}`}
              onClick={() => setActiveKey(tab.key)}
              className={cn(
                '-mb-px border-b-2 px-2 py-3 text-base focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none',
                isActive
                  ? 'border-primary font-bold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id="badge-map-panel-badges"
        aria-labelledby="badge-map-tab-badges"
        hidden={activeKey !== 'badges'}
      >
        {badgesPanel}
      </div>

      <div
        role="tabpanel"
        id="badge-map-panel-map"
        aria-labelledby="badge-map-tab-map"
        hidden={activeKey !== 'map'}
      >
        {mapPanel}
      </div>
    </div>
  )
}
