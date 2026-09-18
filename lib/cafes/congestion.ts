import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * 混雑度（S_CAFE_DETAIL）の読み取り。
 *
 * cafe_congestion_reports の生の行は読めない（SELECT は本人 + admin のみ。user_id と
 * cafe_id と reported_at を突き合わせると「誰が今どのカフェにいるか」が割れるため）。
 * 集計は security definer の get_cafe_congestion_current() に委ねる
 *   supabase/migrations/20260906140100_create_cafe_congestion_reports.sql
 */

type Client = SupabaseClient<Database>

/** 直近30分 → 過去4週間の同曜日同時間帯 → データなし */
export type CongestionSource = 'recent' | 'historical' | 'none'

export type CongestionSummary = {
  source: CongestionSource
  /** 1〜5 の平均。source='none' のときは null */
  levelAvg: number | null
  sampleCount: number
}

export const CONGESTION_LEVELS = 5

/** 5段階の説明。色だけで伝えないための必須テキスト（CLAUDE.md アクセシビリティ） */
export const CONGESTION_LABELS: Record<number, string> = {
  1: '空いている',
  2: 'やや空いている',
  3: '普通',
  4: 'やや混んでいる',
  5: '混んでいる',
}

const NO_DATA: CongestionSummary = { source: 'none', levelAvg: null, sampleCount: 0 }

/** level_avg を 1〜5 に丸めた段階。平均なので四捨五入して1段階に落とす */
export function congestionLevel(levelAvg: number | null): number | null {
  if (levelAvg === null) return null
  return Math.min(CONGESTION_LEVELS, Math.max(1, Math.round(levelAvg)))
}

export function congestionLabel(levelAvg: number | null): string | null {
  const level = congestionLevel(levelAvg)
  return level === null ? null : (CONGESTION_LABELS[level] ?? null)
}

/**
 * RPC の戻り行を整える。
 *
 * level_avg は source='none' のとき実際には NULL だが、supabase gen types は
 * RETURNS TABLE の列を non-nullable に生成する。型を信用せず値で判定する
 *   （関数の comment on function にも明記されている）
 */
export function toCongestionSummary(
  row: { level_avg: number | null; source: string; sample_count: number | null } | undefined,
): CongestionSummary {
  if (!row) return NO_DATA

  const source: CongestionSource =
    row.source === 'recent' || row.source === 'historical' ? row.source : 'none'
  const levelAvg = typeof row.level_avg === 'number' ? row.level_avg : null

  // 片方だけ欠けた状態（平均はあるが source=none 等）は信用せずデータなしに寄せる
  if (source === 'none' || levelAvg === null) return NO_DATA

  return { source, levelAvg, sampleCount: row.sample_count ?? 0 }
}

/**
 * 現在の混雑度。p_now は省略して実時刻を使う（注入できるのはテスト用 — 関数のコメント参照）。
 * 取得に失敗したら例外にする（「データなし」に丸めると障害と区別が付かない）
 */
export async function getCafeCongestion(
  supabase: Client,
  cafeId: string,
): Promise<CongestionSummary> {
  const { data, error } = await supabase.rpc('get_cafe_congestion_current', { p_cafe_id: cafeId })
  if (error) throw new Error(`混雑度の取得に失敗しました: ${error.message}`)

  return toCongestionSummary(data?.[0])
}
