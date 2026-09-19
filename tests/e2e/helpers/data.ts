import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceRoleClient } from '../../helpers/supabase'

/**
 * ログイン後の導線を検証する E2E 用の前提データ。
 *
 * サインアップ導線（signup-onboarding.spec.ts）は OTP メールまで含めて通すが、
 * それ以外のテストが毎回あの縦切りを再実行すると1本あたり数十秒かかる。ここでは
 * service role で「オンボーディング済みユーザー」を直接作り、UI ではログインだけ行う。
 *
 * `seed.sql` が作るのは admin プロフィール1件だけで、カフェも投稿も0件。
 * 必要な前提は各テストが自分で用意して自分で片付ける。
 */

const PASSWORD = 'e2e-password-1'

/**
 * 4プロジェクト（chromium / webkit / mobile-*）とファイル内の並行テストが同時に走るので、
 * 識別子は必ず衝突させない。時刻だけだと同一ミリ秒で重なるため乱数を混ぜる
 */
export function uniqueSuffix(projectName: string): string {
  return `${projectName}_${randomToken(8)}`.replace(/[^a-zA-Z0-9_]/g, '_')
}

function randomToken(length: number): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, length)
}

export type E2EUser = {
  email: string
  password: string
  userId: string
  username: string
}

/**
 * オンボーディング済み（`onboarded_at` あり・`status='active'`）のユーザーを作る。
 * middleware は `onboarded_at` を唯一の判定材料にするため、これが無いと保護ルートから
 * `/onboarding/profile` へ飛ばされる
 *   supabase/migrations/20260905130000_create_profiles.sql
 */
export async function createOnboardedUser(suffix: string): Promise<E2EUser> {
  const service = serviceRoleClient()
  const email = `e2e-data-${suffix}@example.test`
  // username は citext unique かつ3〜20文字。suffix を詰めると上限で切れて衝突しうるので、
  // 表示用の suffix とは別に短い乱数から作る
  const username = `e2e_${randomToken(12)}`

  const created = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (created.error || !created.data.user) {
    throw new Error(`E2E ユーザーの作成に失敗: ${created.error?.message}`)
  }
  const userId = created.data.user.id

  const { error } = await service.from('profiles').insert({
    id: userId,
    username,
    display_name: 'E2E データ太郎',
    // enforce_min_age に弾かれない生年月日
    birth_date: '2000-01-01',
    onboarded_at: new Date().toISOString(),
  })
  if (error) {
    await service.auth.admin.deleteUser(userId)
    throw new Error(`E2E プロフィールの作成に失敗: ${error.message}`)
  }

  return { email, password: PASSWORD, userId, username }
}

export type E2ECafe = { id: string; name: string }

/** 公開中（`status='active'`）のカフェ。これ以外は cafes の RLS が行ごと隠す */
export async function createActiveCafe(suffix: string): Promise<E2ECafe> {
  const service = serviceRoleClient()
  const name = `E2E珈琲店 ${suffix}`

  const { data, error } = await service
    .from('cafes')
    .insert({ name, prefecture: '東京都', city: '渋谷区', status: 'active' })
    .select('id')
    .single()

  if (error || !data) throw new Error(`E2E カフェの作成に失敗: ${error?.message}`)
  return { id: data.id as string, name }
}

/**
 * テストが作った行を消す。`user_cafe_lists` は profiles / cafes の双方から
 * `on delete cascade` で落ちるので個別に消さなくてよい
 */
export async function cleanup(options: { userIds?: string[]; cafeIds?: string[] }): Promise<void> {
  const service: SupabaseClient = serviceRoleClient()

  for (const userId of options.userIds ?? []) {
    await service.auth.admin.deleteUser(userId)
  }
  if (options.cafeIds && options.cafeIds.length > 0) {
    await service.from('cafes').delete().in('id', options.cafeIds)
  }
}
