'use server'

import {
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_INSUFFICIENT_PRIVILEGE,
} from '@/lib/constants/postgres-error-codes'
import { createClient } from '@/lib/supabase/server'
import { escapeIlikePattern, quoteOrFilterValue } from '@/lib/utils/postgrest'
import {
  type CreateCafeInput,
  cafeIdSchema,
  createCafeInputSchema,
  searchCafesSchema,
  type UpdateCafeInput,
  updateCafeSchema,
} from '@/lib/validators/cafes'
import type { ComposerCafe } from '@/types/composer'
import type { Result } from '@/types/result'

type SearchCafesError = 'INVALID_INPUT' | 'INTERNAL_ERROR'
type CreateCafeError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'AREA_CODE_UNKNOWN'
  | 'INTERNAL_ERROR'
type UpdateCafeError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'NOT_OWNER'
  | 'AREA_CODE_UNKNOWN'
  | 'INTERNAL_ERROR'

const RESULT_LIMIT = 20
// area_code の FK 名。将来 cafes に他の FK が増えても誤判定しないための目印
const AREA_CODE_FK_CONSTRAINT = 'cafes_area_code_fkey'
// PostgREST が .single() で0行返ってきたときのエラーコード（SQLSTATEではない）。
// cafes_update_owner の USING 句に弾かれた行は 42501 ではなく単に0件として返るため、
// これで「他人のカフェ」を判定する
const POSTGREST_NO_ROWS = 'PGRST116'

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

/**
 * 送信前に「似た名前の既存カフェ」を見せるための検索（S_CAFE_NEW）。
 * B9: cafes.name に一意制約もGoogle Place IDベースの重複防止も無いため、
 * ブロックはせずアプリ層の警告に留める（docs/product/pending-items.md B9）
 */
export async function findSimilarCafes(
  input: unknown,
): Promise<Result<ComposerCafe[], SearchCafesError>> {
  const parsed = searchCafesSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const query = parsed.data.query?.trim()
  if (!query) return { ok: true, data: [] }

  const supabase = await createClient()
  const pattern = quoteOrFilterValue(`%${escapeIlikePattern(query)}%`)
  const { data, error } = await supabase
    .from('cafes')
    .select('id, name, prefecture, city, areas(label)')
    .eq('status', 'active')
    .or(`name.ilike.${pattern},name_kana.ilike.${pattern}`)
    .order('name')
    .limit(5)

  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  return { ok: true, data: (data as CafeRow[]).map(toComposerCafe) }
}

/**
 * カフェの新規登録（S_CAFE_NEW）。main_image_path は受け取らない
 * （lib/validators/cafes.ts の createCafeSchema コメント参照）。location（lat/lng）は
 * Places Autocomplete で選択済みのときだけ受け取る。
 * 認可は cafes_insert_authenticated に委譲し、ここでは入力の検証と
 * エラーコード変換だけを行う（supabase/migrations/20260906130000_create_cafes.sql）
 */
export async function createCafe(
  input: unknown,
): Promise<Result<{ cafeId: string }, CreateCafeError>> {
  const parsed = createCafeInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  try {
    return await insertCafe(parsed.data)
  } catch (cause) {
    console.error('[cafes] カフェの登録に失敗:', cause)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}

async function insertCafe(
  input: CreateCafeInput,
): Promise<Result<{ cafeId: string }, CreateCafeError>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { data, error } = await supabase
    .from('cafes')
    .insert({
      name: input.name,
      // 未入力の optional 項目は Zod を通ると '' になる（undefined にはならない）。
      // ?? null は '' を弾けないため || null にする。空文字のまま入ると
      // `cafe.description ?? fallback` (S_CAFE_DETAIL) のフォールバックが効かなくなる
      name_kana: input.nameKana || null,
      prefecture: input.prefecture,
      city: input.city,
      area_code: input.areaCode ?? null,
      address: input.address || null,
      phone: input.phone || null,
      website: input.website || null,
      description: input.description || null,
      // lat/lng は createCafeInputSchema が両方セット or 両方省略のみを通す
      location:
        input.lat !== undefined && input.lng !== undefined
          ? `SRID=4326;POINT(${input.lng} ${input.lat})`
          : null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) {
    if (
      error.code === POSTGRES_FOREIGN_KEY_VIOLATION &&
      error.message.includes(AREA_CODE_FK_CONSTRAINT)
    ) {
      return { ok: false, error: 'AREA_CODE_UNKNOWN' }
    }
    // is_active_user() が偽（suspended / pending_consent）
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }

    console.error('[cafes] カフェの登録に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  if (!data) return { ok: false, error: 'FORBIDDEN' }

  return { ok: true, data: { cafeId: data.id } }
}

// external_ids のキー名はここで固定する（B9: 将来 google_place_id への部分一意
// インデックスを検討する前提。docs/product/pending-items.md B9）
function toExternalIds(input: NonNullable<UpdateCafeInput['externalIds']>): Record<string, string> {
  const result: Record<string, string> = {}
  if (input.googlePlaceId) result.google_place_id = input.googlePlaceId
  if (input.tabelogUrl) result.tabelog_url = input.tabelogUrl
  return result
}

/**
 * カフェ情報の編集（S_OWNER_CAFE_EDIT）。認可は cafes_update_owner に委譲する
 * （アプリ層で verified_owner_id を再チェックしない。CLAUDE.md「RLSに認可を委譲」）。
 * USING 句に弾かれた行は0件で返る（42501にはならない）ため、.single() の
 * PGRST116（0行）を NOT_OWNER として扱う
 *   supabase/migrations/20260920140000_allow_cafe_creator_update.sql
 */
export async function updateCafe(
  input: unknown,
): Promise<Result<{ cafeId: string }, UpdateCafeError>> {
  const parsed = updateCafeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  try {
    return await updateCafeRow(parsed.data)
  } catch (cause) {
    console.error('[cafes] カフェの更新に失敗:', cause)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}

async function updateCafeRow(
  input: UpdateCafeInput,
): Promise<Result<{ cafeId: string }, UpdateCafeError>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { data, error } = await supabase
    .from('cafes')
    .update({
      name: input.name,
      // createCafe と同じ理由（223行目付近のコメント）で空文字は null にする
      name_kana: input.nameKana || null,
      prefecture: input.prefecture,
      city: input.city,
      area_code: input.areaCode ?? null,
      address: input.address || null,
      phone: input.phone || null,
      website: input.website || null,
      description: input.description || null,
      // externalIds が省略された呼び出し（将来の他画面からの再利用を想定）では
      // 既存の external_ids を触らない。常に toExternalIds(...) で上書きすると
      // 呼び出し側がキーを送り忘れただけで既存の連携IDが消える
      ...(input.externalIds !== undefined
        ? { external_ids: toExternalIds(input.externalIds) }
        : {}),
    })
    .eq('id', input.cafeId)
    .select('id')
    .single()

  if (error) {
    if (error.code === POSTGREST_NO_ROWS) return { ok: false, error: 'NOT_OWNER' }
    if (
      error.code === POSTGRES_FOREIGN_KEY_VIOLATION &&
      error.message.includes(AREA_CODE_FK_CONSTRAINT)
    ) {
      return { ok: false, error: 'AREA_CODE_UNKNOWN' }
    }
    console.error('[cafes] カフェの更新に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
  if (!data) return { ok: false, error: 'NOT_OWNER' }

  return { ok: true, data: { cafeId: data.id } }
}
