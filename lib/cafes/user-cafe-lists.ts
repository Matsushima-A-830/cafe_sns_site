import type { SupabaseClient } from '@supabase/supabase-js'
import { CAFE_LIST_TYPES, type CafeListType } from '@/lib/constants/cafe-lists'
import type { Database } from '@/types/database'

/**
 * 「お気に入り」「行きたい」（user_cafe_lists）の読み取り。マイページ（S_MYPAGE）と
 * 一覧（S_FAVORITES / S_WANT_TO_GO）から Server Component 経由で呼ぶ
 *   docs/design/wireframes/mypage.md #S_MYPAGE #S_FAVORITES--S_WANT_TO_GO--S_BOOKMARKS
 */

type Client = SupabaseClient<Database>

/** 一覧はページ送り未実装（pending-items D32）。全件返して固まらないための上限 */
export const CAFE_LIST_LIMIT = 100
/** マイページ中段のタブ切替プレビュー（ワイヤーは「最新5件」） */
export const CAFE_LIST_PREVIEW_LIMIT = 5

export type CafeListEntry = {
  cafeId: string
  name: string
  areaLabel: string | null
  note: string | null
  addedAt: string
}

export type CafeListCounts = Record<CafeListType, number>

/**
 * `cafes!inner` が必須。
 *
 * user_cafe_lists_select_own は自分の行を必ず読ませるが、埋め込んだ cafes は
 * cafes_select_active_* が `status='active'` で絞る。閉店（closed）・非公開（hidden）に
 * なった店をリストに入れていると、外側の join だと「リスト行はあるのに cafes が null」に
 * なり、名前も無い空カードが並ぶ。!inner なら行ごと落ちる
 *   supabase/migrations/20260906130000_create_cafes.sql cafes_select_active_anon
 */
const LIST_SELECT = `
  cafe_id, note, created_at,
  cafes!inner (id, name, prefecture, city, areas!cafes_area_code_fkey (label))
` as const

type ListRow = {
  cafe_id: string
  note: string | null
  created_at: string
  cafes: {
    id: string
    name: string
    prefecture: string
    city: string
    areas: { label: string } | null
  }
}

function toEntry(row: ListRow): CafeListEntry {
  return {
    cafeId: row.cafe_id,
    name: row.cafes.name,
    // エリア名が無いカフェ（area_code 未設定）は市区町村で代替する（getCafeDetail と同じ）
    areaLabel: row.cafes.areas?.label ?? `${row.cafes.prefecture}${row.cafes.city}`,
    note: row.note,
    addedAt: row.created_at,
  }
}

/**
 * 1リストぶんを追加日の新しい順で取る。取得自体に失敗したら例外（空配列に丸めない）。
 *
 * user_id は絞らない。user_cafe_lists_select_own が `user_id = auth.uid()` だけで
 * OR を持たないため、RLS だけで本人の行に閉じる（listDrafts と同じ方針）
 */
export async function getUserCafeList(
  supabase: Client,
  listType: CafeListType,
  limit = CAFE_LIST_LIMIT,
): Promise<CafeListEntry[]> {
  const { data, error } = await supabase
    .from('user_cafe_lists')
    .select(LIST_SELECT)
    .eq('list_type', listType)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`カフェリストの取得に失敗しました: ${error.message}`)
  return ((data ?? []) as unknown as ListRow[]).map(toEntry)
}

/**
 * 4カードの件数バッジ。一覧（getUserCafeList）と必ず同じ条件で数える。
 * `cafes!inner` を省くと閉店・非公開の店が件数だけに残り、「42」と出しているのに
 * 41件しか並ばない状態になる
 */
export async function getUserCafeListCounts(supabase: Client): Promise<CafeListCounts> {
  const results = await Promise.all(
    CAFE_LIST_TYPES.map((listType) =>
      supabase
        .from('user_cafe_lists')
        .select('cafe_id, cafes!inner (id)', { count: 'exact', head: true })
        .eq('list_type', listType),
    ),
  )

  const counts = {} as CafeListCounts
  CAFE_LIST_TYPES.forEach((listType, index) => {
    const result = results[index]
    if (result?.error) {
      throw new Error(`カフェリストの件数取得に失敗しました: ${result.error.message}`)
    }
    counts[listType] = result?.count ?? 0
  })
  return counts
}

/**
 * カフェ詳細のトグルの初期状態。2つのリストは排他ではないので両方の在否を返す。
 * ここは `!inner` を付けない（カフェ詳細が開けている＝そのカフェは active）
 */
export async function getCafeListMembership(
  supabase: Client,
  cafeId: string,
): Promise<Record<CafeListType, boolean>> {
  const { data, error } = await supabase
    .from('user_cafe_lists')
    .select('list_type')
    .eq('cafe_id', cafeId)

  if (error) throw new Error(`カフェリストの状態取得に失敗しました: ${error.message}`)

  const listTypes = new Set((data ?? []).map((row) => row.list_type))
  return {
    favorite: listTypes.has('favorite'),
    want_to_go: listTypes.has('want_to_go'),
  }
}
