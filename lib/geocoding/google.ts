import 'server-only'
import { serverEnv } from '@/lib/env.server'
import type { Result } from '@/types/result'

type GeocodeError = 'NOT_FOUND' | 'EXTERNAL_SERVICE_ERROR'

const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json'

/**
 * Google Geocoding API で住所文字列を緯度経度に変換する。
 * 20260926214427_backfill_area_coordinates.sql の「"東京都 {label}" で問い合わせ」を踏襲。
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY はブラウザ用（HTTPリファラー制限あり）だが、
 * サーバーからのGeocoding呼び出しでも問題ないことを確認済み（pending-items D63）
 */
export async function geocodeAddress(
  query: string,
): Promise<Result<{ lat: number; lng: number }, GeocodeError>> {
  if (!serverEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
    return { ok: false, error: 'EXTERNAL_SERVICE_ERROR' }

  const url = new URL(GEOCODE_ENDPOINT)
  url.searchParams.set('address', query)
  url.searchParams.set('language', 'ja')
  url.searchParams.set('region', 'jp')
  url.searchParams.set('key', serverEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)

  const response = await fetch(url.toString())
  if (!response.ok) return { ok: false, error: 'EXTERNAL_SERVICE_ERROR' }

  const body = (await response.json()) as {
    status: string
    results: Array<{ geometry: { location: { lat: number; lng: number } } }>
  }

  const first = body.results[0]
  if (body.status === 'ZERO_RESULTS') return { ok: false, error: 'NOT_FOUND' }
  if (body.status !== 'OK' || !first) return { ok: false, error: 'EXTERNAL_SERVICE_ERROR' }

  const { lat, lng } = first.geometry.location
  return { ok: true, data: { lat, lng } }
}
