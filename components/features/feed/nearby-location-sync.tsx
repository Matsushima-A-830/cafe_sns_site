'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * S_EXPLORE「近くのカフェ」タブ用。初回はSSRがフォールバック中心（新宿駅）で描画済みなので、
 * 現在地が取れたら URL に lat/lng を足して再描画させる。map-view.tsx と違いタブは URL 駆動
 * （feed-tabs.tsx）なので、client state ではなく router.replace で座標を反映する
 *   pending-items D25
 */
export function NearbyLocationSync() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requested = useRef(false)

  useEffect(() => {
    if (requested.current) return
    if (searchParams.get('lat') || searchParams.get('lng')) return
    if (!navigator.geolocation) return
    requested.current = true

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = new URLSearchParams(searchParams.toString())
        next.set('lat', String(position.coords.latitude))
        next.set('lng', String(position.coords.longitude))
        router.replace(`/explore?${next.toString()}`)
      },
      // 拒否・失敗はフォールバック中心のまま続行する（map-view.tsx と同じ方針）
      () => {},
      { timeout: 5000 },
    )
  }, [router, searchParams])

  return null
}
