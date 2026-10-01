'use server'

import { geocodeAddress } from '@/lib/geocoding/google'
import { createClient } from '@/lib/supabase/server'
import type { Result } from '@/types/result'

/**
 * D63フォローアップ: 既存カフェの cafes.location バックフィル。
 * nearby_cafes() が where location is not null でフィルタするため、Places
 * Autocomplete導入（#88）以前に登録されたカフェは地図・一覧に出てこない
 *   docs/product/pending-items.md #d63-s_map
 *   supabase/migrations/20260926224028_create_nearby_cafes_function.sql
 */

type AdminGuardError = 'UNAUTHENTICATED' | 'FORBIDDEN'
type Client = Awaited<ReturnType<typeof createClient>>

// requireAdmin は他の admin Server Actions と同じ内容を複製する（このプロジェクトの方針。共通化しない）
async function requireAdmin(supabase: Client): Promise<Result<{ id: string }, AdminGuardError>> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw new Error(`権限確認に失敗しました: ${error.message}`)
  if (profile?.role !== 'admin' || profile.status !== 'active') {
    return { ok: false, error: 'FORBIDDEN' }
  }

  return { ok: true, data: { id: user.id } }
}

type CountCafesMissingLocationError = AdminGuardError

/** 実行前のプレビュー表示用。バックフィル対象の件数のみ返す */
export async function countCafesMissingLocation(): Promise<
  Result<{ count: number }, CountCafesMissingLocationError>
> {
  const supabase = await createClient()
  const guard = await requireAdmin(supabase)
  if (!guard.ok) return guard

  const { count, error } = await supabase
    .from('cafes')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .is('location', null)

  if (error) throw new Error(`カフェ件数の取得に失敗しました: ${error.message}`)

  return { ok: true, data: { count: count ?? 0 } }
}

type SkipReason = 'NOT_FOUND' | 'EXTERNAL_SERVICE_ERROR' | 'UPDATE_FAILED'

export type BackfillCafeLocationsResult = {
  processed: number
  updated: number
  skipped: Array<{ cafeId: string; name: string; reason: SkipReason }>
}

type BackfillCafeLocationsError = AdminGuardError

/**
 * status=active かつ location 未設定のカフェを対象に、prefecture+city+address を
 * Geocoding APIに問い合わせて座標を埋める。失敗（住所不明・API異常・DB更新失敗）は
 * スキップして次に進む（自動リトール・手動レビューキューは過剰設計。pending-items D63）
 */
export async function backfillCafeLocations(): Promise<
  Result<BackfillCafeLocationsResult, BackfillCafeLocationsError>
> {
  const supabase = await createClient()
  const guard = await requireAdmin(supabase)
  if (!guard.ok) return guard

  const { data, error } = await supabase
    .from('cafes')
    .select('id, name, prefecture, city, address')
    .eq('status', 'active')
    .is('location', null)

  if (error) throw new Error(`カフェ一覧の取得に失敗しました: ${error.message}`)

  const cafes = data ?? []
  const skipped: BackfillCafeLocationsResult['skipped'] = []
  let updated = 0

  for (const cafe of cafes) {
    const query = [cafe.prefecture, cafe.city, cafe.address].filter(Boolean).join(' ')
    const geocoded = await geocodeAddress(query)
    if (!geocoded.ok) {
      skipped.push({ cafeId: cafe.id, name: cafe.name, reason: geocoded.error })
      continue
    }

    const { error: updateError } = await supabase
      .from('cafes')
      .update({ location: `SRID=4326;POINT(${geocoded.data.lng} ${geocoded.data.lat})` })
      .eq('id', cafe.id)

    if (updateError) {
      console.error('[admin-cafe-locations] locationの更新に失敗:', cafe.id, updateError)
      skipped.push({ cafeId: cafe.id, name: cafe.name, reason: 'UPDATE_FAILED' })
      continue
    }

    updated += 1
  }

  return { ok: true, data: { processed: cafes.length, updated, skipped } }
}
