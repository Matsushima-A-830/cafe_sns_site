'use server'

import { createClient } from '@/lib/supabase/server'
import { escapeIlikePattern, quoteOrFilterValue } from '@/lib/utils/postgrest'
import { cafeIdSchema, searchCafesSchema } from '@/lib/validators/cafes'
import type { ComposerCafe } from '@/types/composer'
import type { Result } from '@/types/result'

type SearchCafesError = 'INVALID_INPUT' | 'INTERNAL_ERROR'

const RESULT_LIMIT = 20

type CafeRow = {
  id: string
  name: string
  prefecture: string
  city: string
  areas: { label: string } | null
}

function toComposerCafe(row: CafeRow): ComposerCafe {
  return {
    id: row.id,
    name: row.name,
    // エリア名があれば最も見分けがつく。無いカフェ（area_code 未設定）は市区町村で代替する
    areaLabel: row.areas?.label ?? `${row.prefecture}${row.city}`,
  }
}

/**
 * composer のカフェ選択用の検索。
 *
 * 検索語が空のときはホームエリア（profiles.home_area_code）のカフェを返す。
 * 「まず自分の行動圏が並んでいる」状態から始めることで、毎回ゼロから検索させない
 * （デフォルト効果 — docs/design/wireframes/composer.md）
 */
export async function searchCafes(
  input: unknown,
): Promise<Result<ComposerCafe[], SearchCafesError>> {
  const parsed = searchCafesSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const query = parsed.data.query?.trim()

  const base = supabase
    .from('cafes')
    .select('id, name, prefecture, city, areas(label)')
    .eq('status', 'active')
    .order('name')
    .limit(RESULT_LIMIT)

  if (!query) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: true, data: [] }

    const { data: profile } = await supabase
      .from('profiles')
      .select('home_area_code')
      .eq('id', user.id)
      .maybeSingle()

    // ホームエリア未設定なら初期候補は出さない（全国のカフェを並べても選びようがない）
    if (!profile?.home_area_code) return { ok: true, data: [] }

    const { data, error } = await base.eq('area_code', profile.home_area_code)
    if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
    return { ok: true, data: (data as CafeRow[]).map(toComposerCafe) }
  }

  // name には trgm 索引が無い（name_kana のみ）が、MVP のデータ量では ilike で足りる。
  // 遅くなったら name 側にも索引を足す（tables.md #cafes）
  const pattern = quoteOrFilterValue(`%${escapeIlikePattern(query)}%`)
  const { data, error } = await base.or(`name.ilike.${pattern},name_kana.ilike.${pattern}`)

  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  return { ok: true, data: (data as CafeRow[]).map(toComposerCafe) }
}

/** 下書き再開時に「選択中のカフェ名」を復元するために1件だけ引く */
export async function getCafeById(
  input: unknown,
): Promise<Result<ComposerCafe | null, SearchCafesError>> {
  const parsed = cafeIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cafes')
    .select('id, name, prefecture, city, areas(label)')
    .eq('id', parsed.data.cafeId)
    // searchCafes と同じ条件で絞る。これが無いと、下書き保存後に閉店・非公開になった
    // カフェが再開時だけ復活し、検索では選べないものが投稿に紐づく
    .eq('status', 'active')
    .maybeSingle()

  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  return { ok: true, data: data ? toComposerCafe(data as CafeRow) : null }
}
