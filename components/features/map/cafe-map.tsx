'use client'

import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMap,
  Pin,
  useMap,
} from '@vis.gl/react-google-maps'
import { useEffect } from 'react'
import type { NearbyCafe } from '@/lib/cafes/nearby'
import { env } from '@/lib/env'

/**
 * S_MAP の地図表示。マーカー色は Google のデフォルト（赤系）ではなく
 * brown-500/700（design-system.md）に寄せる。Pin は Google Maps SDK が直接描画するため
 * Tailwindクラスは届かないが、CSS変数の参照は解決されるので var() を渡す
 * （trend-chart.tsx の Recharts と同じ回避策）
 */
const MARKER_BACKGROUND = 'var(--color-brown-500)'
const MARKER_BORDER = 'var(--color-brown-700)'
const DEFAULT_ZOOM = 14

function Recenter({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap()

  useEffect(() => {
    map?.panTo(center)
  }, [map, center])

  return null
}

export function CafeMap({
  cafes,
  center,
  selectedCafeId,
  onSelectMarker,
}: {
  cafes: NearbyCafe[]
  center: { lat: number; lng: number }
  selectedCafeId: string | null
  onSelectMarker: (cafeId: string) => void
}) {
  if (!env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="flex h-full items-center justify-center bg-muted p-4 text-center text-sm text-muted-foreground">
        地図を表示するには Google Maps の設定が必要です
      </div>
    )
  }

  return (
    <APIProvider apiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}>
      <GoogleMap
        defaultCenter={center}
        defaultZoom={DEFAULT_ZOOM}
        // AdvancedMarker には Map ID が必須。専用の Map ID は Google Cloud 側の作成作業が
        // 別途要るため、Google公式が提供する検証用IDを暫定で使う（本番運用時に要差し替え）
        mapId="DEMO_MAP_ID"
        gestureHandling="greedy"
        disableDefaultUI={false}
        className="h-full w-full"
      >
        <Recenter center={center} />
        {cafes.map((cafe) => (
          <AdvancedMarker
            key={cafe.cafeId}
            position={{ lat: cafe.lat, lng: cafe.lng }}
            onClick={() => onSelectMarker(cafe.cafeId)}
            title={cafe.name}
          >
            <Pin
              background={MARKER_BACKGROUND}
              borderColor={MARKER_BORDER}
              glyphColor={MARKER_BORDER}
              scale={cafe.cafeId === selectedCafeId ? 1.3 : 1}
            />
          </AdvancedMarker>
        ))}
      </GoogleMap>
    </APIProvider>
  )
}
