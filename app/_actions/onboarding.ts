'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  areaSchema,
  interestsSchema,
  profileSchema,
  usernameSchema,
} from '@/lib/validators/onboarding'
import type { Result } from '@/types/result'

const POSTGRES_UNIQUE_VIOLATION = '23505'
const POSTGRES_FOREIGN_KEY_VIOLATION = '23503'

type SignupMetadata = {
  birth_date?: string
  age_category?: 'minor' | 'adult'
  guardian_email?: string
}

export async function checkUsernameAvailable(
  username: string,
): Promise<Result<{ available: boolean }>> {
  const parsed = usernameSchema.safeParse(username)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', parsed.data)
    .maybeSingle()
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }

  return { ok: true, data: { available: data === null } }
}

/**
 * profiles 行はここで初めて作られる。username / display_name / birth_date が揃うのが
 * この時点のため（docs/architecture/data-model/tables.md#profiles）。
 * birth_date は signup/birthdate で auth の app_metadata（Admin API 経由、本人は書き換え不可）
 * に一時保持したものを読む
 */
export async function submitProfile(input: unknown): Promise<Result<null>> {
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const metadata = user.app_metadata as SignupMetadata
  // OTP確認後にタブを閉じる等で /signup/birthdate を経ずにここへ来た場合。
  // 生年月日はURL直打ちでしか戻れないため、専用コードでその画面へ差し戻す
  if (!metadata.birth_date || !metadata.age_category) {
    return { ok: false, error: 'BIRTHDATE_REQUIRED' }
  }

  // /signup/consent を飛ばして直接ここに来ると guardian_email が無いまま
  // pending_consent の凍結アカウントができ、/account/pending には再入力導線が無いため詰む
  if (metadata.age_category === 'minor' && !metadata.guardian_email) {
    return { ok: false, error: 'CONSENT_REQUIRED' }
  }

  const status = metadata.age_category === 'minor' ? 'pending_consent' : 'active'

  const { error } = await supabase.from('profiles').insert({
    id: user.id,
    username: parsed.data.username,
    display_name: parsed.data.displayName,
    bio: parsed.data.bio ?? null,
    avatar_url: parsed.data.avatarUrl ?? null,
    birth_date: metadata.birth_date,
    status,
    guardian_email: metadata.guardian_email ?? null,
  })

  if (error) {
    // PK は id (= 自分自身の auth id) なので、二重送信は profiles_pkey 違反であって
    // ユーザーネーム重複ではない。制約名で区別しないと「使用済み」と誤表示する
    if (error.code === POSTGRES_UNIQUE_VIOLATION) {
      return error.message.includes('username')
        ? { ok: false, error: 'USERNAME_ALREADY_EXISTS' }
        : { ok: false, error: 'CONFLICT' }
    }
    return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  }

  // 一時保持していた下書き項目は不要になったので消す。custom_access_token_hook が
  // JWT クレイムからは既に除去しているため失敗してもクレイム漏洩にはならないが、
  // raw_app_meta_data 自体に残ってしまうこと自体は多層防御の欠落なのでログに残す
  const { error: cleanupError } = await createAdminClient().auth.admin.updateUserById(user.id, {
    app_metadata: { birth_date: null, age_category: null, guardian_email: null },
  })
  if (cleanupError) {
    console.error('signup draft の app_metadata クリーンアップに失敗', user.id, cleanupError)
  }

  // status (pending_consent/active) が変わったので JWT クレイムを即時反映させる。
  // 更新しないと custom_access_token_hook が古い（profiles 行が無かった時点の）値のままになり、
  // middleware が誤判定する（docs/architecture/routing.md#カスタムクレイムの同期方式）
  await supabase.auth.refreshSession()

  return { ok: true, data: null }
}

export async function submitArea(input: unknown): Promise<Result<null>> {
  const parsed = areaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  // update は該当行が0件でもエラーにならない（PostgREST）。.single() で
  // 実際に1行更新されたことを確認する
  const { error } = await supabase
    .from('profiles')
    .update({ home_area_code: parsed.data.areaCode ?? null })
    .eq('id', user.id)
    .select('id')
    .single()

  if (error) {
    // home_area_code は areas.code への FK。存在しないコードは一意制約ではなく外部キー制約に違反する
    if (error.code === POSTGRES_FOREIGN_KEY_VIOLATION)
      return { ok: false, error: 'AREA_CODE_UNKNOWN' }
    return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  }

  return { ok: true, data: null }
}

/**
 * 幹A: 唯一スキップ不可のステップ。1〜5個の occasion/mood タグを保存し、
 * 完了時に onboarded_at を書く（middleware が /onboarding へ誘導するか判定する唯一の材料）
 */
export async function submitInterests(input: unknown): Promise<Result<null>> {
  const parsed = interestsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  // 既存タグを削除してから INSERT する（置き換え）。2回の別々の呼び出しだと
  // delete 成功・insert 失敗の片方だけが確定してタグがゼロ件になりうるため、
  // 1つの Postgres 関数にまとめてアトミックに実行する（失敗時は暗黙のロールバック）
  const { error: replaceError } = await supabase.rpc('replace_user_interest_tags', {
    p_tag_ids: parsed.data.tagIds,
  })
  if (replaceError) return { ok: false, error: 'INTERNAL_ERROR', details: replaceError.message }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('id')
    .single()

  if (updateError) return { ok: false, error: 'INTERNAL_ERROR', details: updateError.message }

  // onboarded フラグを JWT に即時反映させる（submitProfile と同じ理由）
  await supabase.auth.refreshSession()

  return { ok: true, data: null }
}
