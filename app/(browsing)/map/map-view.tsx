'use client'

import { useEffect, useRef, useState } from 'react'
import { searchNearbyCafes } from '@/app/_actions/map'
import { CafeBottomSheet } from '@/components/features/map/cafe-bottom-sheet'
import { CafeList } from '@/components/features/map/cafe-list'
import { CafeMap } from '@/components/features/map/cafe-map'
import { FilterBar } from '@/components/features/map/filter-bar'
import { type MapViewMode, ViewModeToggle } from '@/components/features/map/view-mode-toggle'
import type { NearbyCafe } from '@/lib/cafes/nearby'
import { cn } from '@/lib/utils/cn'

/** フィルタ・現在地が変わるたびに投げ直す前の間隔 */
const REFETCH_DEBOUNCE_MS = 400

type Area = { code: string; label: string }
type LatLng = { lat: number; lng: number }

export function MapView({
  areas,
  initialCafes,
  defaultCenter,
  isAuthenticated,
}: {
  areas: Area[]
  initialCafes: NearbyCafe[]
  defaultCenter: LatLng
  isAuthenticated: boolean
}) {
  const [position, setPosition] = useState<LatLng>(defaultCenter)
  const [areaCode, setAreaCode] = useState('')
  const [query, setQuery] = useState('')
  const [cafes, setCafes] = useState(initialCafes)
  const [viewMode, setViewMode] = useState<MapViewMode>('map')
  const [selectedCafeId, setSelectedCafeId] = useState<string | null>(null)

  // 現在地取得。拒否・失敗（HTTPS未提供のプレビュー環境等）はデフォルト中心のまま続行する
  // — GPSは補助機能であり、失敗を握りつぶさず早期リターンする対象ではなく単に「使わない」だけ
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (geoPosition) => {
        setPosition({ lat: geoPosition.coords.latitude, lng: geoPosition.coords.longitude })
      },
      () => {},
      { timeout: 5000 },
    )
  }, [])

  // 初回マウント時はスキップする: page.tsx（Server Component）が defaultCenter・フィルタ無しで
  // 既に getNearbyCafes を呼んでおり、initialCafes がその結果そのものなので同じ問い合わせを
  // 二重に投げない。position/areaCode/query が実際に変わったときだけ取り直す
  const isInitialRender = useRef(true)
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      const result = await searchNearbyCafes({
        lat: position.lat,
        lng: position.lng,
        areaCode: areaCode || undefined,
        query: query || undefined,
      })
      if (!cancelled && result.ok) setCafes(result.data)
    }, REFETCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [position, areaCode, query])

  const selectedCafe = cafes.find((cafe) => cafe.cafeId === selectedCafeId) ?? null

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex flex-col gap-3 lg:w-96 lg:shrink-0">
        <FilterBar
          areas={areas}
          areaCode={areaCode}
          onAreaChange={setAreaCode}
          query={query}
          onQueryChange={setQuery}
        />
        <div className="lg:hidden">
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        </div>
        <div className={cn(viewMode === 'map' && 'hidden', 'lg:block')}>
          <CafeList cafes={cafes} selectedCafeId={selectedCafeId} onSelect={setSelectedCafeId} />
        </div>
      </div>

      <div
        className={cn(
          'relative h-[65vh] overflow-hidden rounded-lg lg:h-[70vh] lg:flex-1',
          viewMode === 'list' && 'hidden',
          'lg:block',
        )}
      >
        <CafeMap
          cafes={cafes}
          center={position}
          selectedCafeId={selectedCafeId}
          onSelectMarker={setSelectedCafeId}
        />
        {selectedCafe && (
          <div className="lg:hidden">
            {/* key必須: マーカーを切り替えても同一インスタンスが再利用され、
                CafeListButtons の楽観更新state（前のカフェの「行きたい」状態）が残ってしまう */}
            <CafeBottomSheet
              key={selectedCafe.cafeId}
              cafe={selectedCafe}
              isAuthenticated={isAuthenticated}
              onClose={() => setSelectedCafeId(null)}
              onShowList={() => setViewMode('list')}
            />
          </div>
        )}
      </div>
    </div>
  )
}
