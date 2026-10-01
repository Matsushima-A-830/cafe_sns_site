'use client'

import { AdvancedMarker, APIProvider, Map as GoogleMap, Pin } from '@vis.gl/react-google-maps'
import { env } from '@/lib/env'

/**
 * S_CAFE_DETAIL の単一カフェ地図。cafe-map.tsx（S_MAP、複数カフェ・距離順）とは
 * 前提が異なり NearbyCafe[] には依存しない。配色・mapId は cafe-map.tsx を踏襲する
 */
const MARKER_BACKGROUND = 'var(--color-brown-500)'
const MARKER_BORDER = 'var(--color-brown-700)'
const DEFAULT_ZOOM = 16

export function CafeDetailMap({
  location,
  cafeName,
}: {
  location: { lat: number; lng: number }
  cafeName: string
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
        defaultCenter={location}
        defaultZoom={DEFAULT_ZOOM}
        // AdvancedMarker には Map ID が必須。本番差し替えは別スコープ（pending-items D63）
        mapId="DEMO_MAP_ID"
        gestureHandling="greedy"
        disableDefaultUI={false}
        className="h-full w-full"
      >
        <AdvancedMarker position={location} title={cafeName}>
          <Pin
            background={MARKER_BACKGROUND}
            borderColor={MARKER_BORDER}
            glyphColor={MARKER_BORDER}
          />
        </AdvancedMarker>
      </GoogleMap>
    </APIProvider>
  )
}
