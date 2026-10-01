'use client'

import { useState } from 'react'
import { CafeDetailMap } from '@/components/features/cafes/cafe-detail-map'
import { cn } from '@/lib/utils/cn'

/**
 * モバイルはワイヤー（browsing.md #S_CAFE_DETAIL）の「[地図で見る]」ボタンを
 * /map への遷移ではなくその場の開閉にする（pending-items D30）。PC は lg 以上で
 * 常時表示にし、ボタンごと隠す
 */
export function CafeMapSection({
  location,
  cafeName,
}: {
  location: { lat: number; lng: number } | null
  cafeName: string
}) {
  const [open, setOpen] = useState(false)

  if (!location) return null

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">地図</h2>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none lg:hidden"
        >
          {open ? '地図を閉じる' : '地図で見る'}
        </button>
      </div>
      <div
        className={cn(
          'h-64 w-full overflow-hidden rounded-lg',
          open ? 'block' : 'hidden',
          'lg:block',
        )}
      >
        <CafeDetailMap location={location} cafeName={cafeName} />
      </div>
    </section>
  )
}
