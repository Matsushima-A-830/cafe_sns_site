import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

// 制覇マップの範囲。簡易版は東京23区のみ（docs/product/pending-items.md D59）
const TOKYO_PREFECTURE_CODE = 'JP-13'

export type WardVisit = {
  code: string
  label: string
  visited: boolean
}

export type ConquestMapProgress = {
  wards: WardVisit[]
  visitedCount: number
  totalCount: number
}

/** 東京23区の訪問済み/未訪問一覧を返す（実SVG地図ではなく一覧+チェックマーク版） */
export async function getConquestMapProgress(
  supabase: Client,
  userId: string,
): Promise<ConquestMapProgress> {
  const [{ data: wards }, { data: visits }] = await Promise.all([
    supabase
      .from('areas')
      .select('code, label')
      .eq('level', 'ward')
      .eq('prefecture_code', TOKYO_PREFECTURE_CODE)
      .order('priority', { ascending: false }),
    supabase.from('area_visits').select('area_code').eq('user_id', userId),
  ])

  const visitedCodes = new Set((visits ?? []).map((row) => row.area_code))
  const list = (wards ?? []).map((ward) => ({
    code: ward.code,
    label: ward.label,
    visited: visitedCodes.has(ward.code),
  }))

  return {
    wards: list,
    visitedCount: list.filter((ward) => ward.visited).length,
    totalCount: list.length,
  }
}
