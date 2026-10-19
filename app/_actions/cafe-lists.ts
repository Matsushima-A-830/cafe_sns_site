'use server'

import { cafeExists } from '@/lib/cafes/cafe-detail'
import { getCafeListMembership } from '@/lib/cafes/user-cafe-lists'
import type { CafeListType } from '@/lib/constants/cafe-lists'
import {
  POSTGRES_CHECK_VIOLATION,
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_INSUFFICIENT_PRIVILEGE,
  POSTGRES_UNIQUE_VIOLATION,
} from '@/lib/constants/postgres-error-codes'
import { reportError } from '@/lib/monitoring/report-error'
import { createClient } from '@/lib/supabase/server'
import { type CafeListEntryInput, cafeListEntrySchema } from '@/lib/validators/cafe-lists'
import { cafeIdSchema } from '@/lib/validators/cafes'
import type { Result } from '@/types/result'

/**
 * 「お気に入り」「行きたい」の出し入れ（S_CAFE_DETAIL / S_FAVORITES / S_WANT_TO_GO）。
 * 認可は user_cafe_lists_insert_own / _delete_own に委譲し、ここでは入力の検証と
 * エラーコード変換だけを行う
 *   supabase/migrations/20260918120000_create_user_cafe_lists.sql
 *
 * glossary の `toggleFavorite()` / `toggleWantToGo()` は list_type を引数に畳み、
 * 追加と解除も分けている（followUser / unfollowUser と同じ。トグルにすると
 * 二重クリックで「どちらの状態を求めたのか」がサーバー側で決められない）
 */

// 23503 の出どころを見分けるための FK 名。user_id → profiles の違反と混ぜない
const CAFE_FK_CONSTRAINT = 'user_cafe_lists_cafe_id_fkey'

type AddToListError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CAFE_NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'

type RemoveFromListError = 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'INTERNAL_ERROR'

export async function addCafeToList(input: unknown): Promise<Result<null, AddToListError>> {
  const parsed = cafeListEntrySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  // cafeExists は失敗を例外にする。Server Actions の境界なのでここで Result に畳む
  try {
    return await insertEntry(parsed.data)
  } catch (cause) {
    reportError('cafe-lists', 'リストへの追加に失敗', cause)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}

async function insertEntry(input: CafeListEntryInput): Promise<Result<null, AddToListError>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  // FK は cafes.status を見ないため、これが無いと closed / hidden なカフェへの追加だけが
  // 成功し、存在しないIDとの違いから「その行がまだ在ること」が漏れる（詳細ページは
  // どちらも 404 にしている）
  if (!(await cafeExists(supabase, input.cafeId))) return { ok: false, error: 'CAFE_NOT_FOUND' }

  // insert しっぱなしにせず select() で返り行を確かめる。RLS に弾かれたケースが
  // エラーではなく「0件の成功」として返る経路があり、握ると弾かれたのに成功扱いになる
  const { data, error } = await supabase
    .from('user_cafe_lists')
    .insert({ user_id: user.id, cafe_id: input.cafeId, list_type: input.listType })
    .select('cafe_id')
    .maybeSingle()

  if (error) {
    // 主キー (user_id, cafe_id, list_type) の重複。専用コードは無いので CONFLICT を使う
    //   docs/architecture/error-catalog.md
    if (error.code === POSTGRES_UNIQUE_VIOLATION) return { ok: false, error: 'CONFLICT' }
    if (error.code === POSTGRES_FOREIGN_KEY_VIOLATION) {
      // FK は cafe_id だけでなく user_id → profiles にもある。23503 を一律に
      // 「カフェが無い」と読むと、profiles 行がまだ無いユーザー（OTP確認後・
      // オンボーディング前）に「カフェを選び直してください」と出てしまう
      return error.message.includes(CAFE_FK_CONSTRAINT)
        ? { ok: false, error: 'CAFE_NOT_FOUND' }
        : { ok: false, error: 'FORBIDDEN' }
    }
    // Zod と CHECK 制約が同じ2値を見ているので通常は届かない
    if (error.code === POSTGRES_CHECK_VIOLATION) return { ok: false, error: 'INVALID_INPUT' }
    // is_active_user() が偽（suspended / pending_consent）
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }

    reportError('cafe-lists', 'リストへの追加に失敗', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  if (!data) return { ok: false, error: 'FORBIDDEN' }

  // revalidatePath は呼ばない: /cafes/[id] も /me も auth.getUser() で cookie を読む
  // 動的レンダリングで、そもそもキャッシュに載っていない（pending-items D23）
  return { ok: true, data: null }
}

/**
 * リストから外す。存在しない行の delete は 0件成功で返るが、そのまま成功にしてよい
 * （二重クリックや既に解除済みでも「リストに無い」という結果は同じ）。
 *
 * list_type まで必ず絞る。省くと「お気に入りを外したら行きたいからも消えた」になる
 */
export async function removeCafeFromList(
  input: unknown,
): Promise<Result<null, RemoveFromListError>> {
  const parsed = cafeListEntrySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { error } = await supabase
    .from('user_cafe_lists')
    .delete()
    .eq('cafe_id', parsed.data.cafeId)
    .eq('list_type', parsed.data.listType)

  if (error) {
    reportError('cafe-lists', 'リストからの解除に失敗', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
  return { ok: true, data: null }
}

/**
 * S_MAP のボトムシートなど、Server Component を介さずクライアントから
 * 開閉のたびに「行きたい」等の状態を知りたい画面向け。未ログインは全部 false を返す
 * （CafeListButtons 側がログイン導線に切り替える）
 */
export async function getCafeListMembershipForCafe(
  input: unknown,
): Promise<Result<Record<CafeListType, boolean>, 'INVALID_INPUT' | 'INTERNAL_ERROR'>> {
  const parsed = cafeIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: true, data: { favorite: false, want_to_go: false } }

  try {
    const membership = await getCafeListMembership(supabase, parsed.data.cafeId)
    return { ok: true, data: membership }
  } catch (cause) {
    reportError('cafe-lists', 'カフェリストの状態取得に失敗', cause)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}
