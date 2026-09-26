'use client'

import { cn } from '@/lib/utils/cn'

export type MapViewMode = 'map' | 'list'

const TABS: { mode: MapViewMode; label: string }[] = [
  { mode: 'map', label: '地図' },
  { mode: 'list', label: '一覧' },
]

export function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: MapViewMode
  onChange: (mode: MapViewMode) => void
}) {
  return (
    <div role="tablist" className="flex gap-2">
      {TABS.map((tab) => (
        <button
          key={tab.mode}
          type="button"
          role="tab"
          aria-selected={mode === tab.mode}
          onClick={() => onChange(tab.mode)}
          className={cn(
            'flex-1 rounded-md border px-4 py-2 text-sm font-bold transition-colors',
            'focus-visible:ring-2 focus-visible:ring-ring-focus',
            mode === tab.mode
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border-default bg-surface text-foreground hover:bg-muted',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
