'use client'

import { useEffect, useState } from 'react'
import { haversineDistanceMeters } from '@/lib/utils/geo-distance'
import { estimateWalkMinutes } from '@/lib/utils/walking-time'

/**
 * 閲覧者の現在地×カフェの座標から「徒歩3分」を出す。現在地取得は map-view.tsx と同じ
 * 失敗許容パターン（拒否・非対応は握りつぶして単に出さない）
 */
export function WalkingTimeBadge({ location }: { location: { lat: number; lng: number } | null }) {
  const [minutes, setMinutes] = useState<number | null>(null)

  useEffect(() => {
    if (!location || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const distance = haversineDistanceMeters(location, {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
        setMinutes(estimateWalkMinutes(distance))
      },
      () => {},
      { timeout: 5000 },
    )
  }, [location])

  if (minutes === null) return null

  return <span className="ml-2">徒歩{minutes}分</span>
}
