'use client'

import { type ReactNode, useState } from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * S_USER_PROFILE_PUBLIC の「投稿 / 行きつけ」タブ切替。badge-map-tabs.tsx と同じ形:
 * データはサーバーで取り切って渡し、タブ切替はクライアント側の表示切替のみで完結させる。
 * 行きつけが0件のときはこのコンポーネント自体を出さない（呼び出し側の責務。D25・D28と同じ判断）
 */

const TABS = [
  { key: 'posts', label: '投稿' },
  { key: 'regulars', label: '行きつけ' },
] as const

export function PublicProfileTabs({
  postsPanel,
  regularsPanel,
}: {
  postsPanel: ReactNode
  regularsPanel: ReactNode
}) {
  const [activeKey, setActiveKey] = useState<(typeof TABS)[number]['key']>('posts')

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="投稿・行きつけの切り替え"
        className="flex gap-6 border-b border-border-default"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeKey
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`public-profile-tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`public-profile-panel-${tab.key}`}
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
        id="public-profile-panel-posts"
        aria-labelledby="public-profile-tab-posts"
        hidden={activeKey !== 'posts'}
      >
        {postsPanel}
      </div>

      <div
        role="tabpanel"
        id="public-profile-panel-regulars"
        aria-labelledby="public-profile-tab-regulars"
        hidden={activeKey !== 'regulars'}
      >
        {regularsPanel}
      </div>
    </div>
  )
}
