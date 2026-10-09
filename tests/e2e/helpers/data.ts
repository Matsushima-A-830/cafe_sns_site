import { createHash } from 'node:crypto'
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
 * オンボーディング途中（`onboarded_at` 無し・`status='active'`）のユーザーを作る。
 * middleware は `/onboarding` 配下だけは onboarded_at の有無に関わらず通すため、
 * ログイン直後に `/onboarding/area` 等へ直接遷移させて検証できる
 *   supabase/migrations/20260905130000_create_profiles.sql
 */
export async function createInProgressOnboardingUser(suffix: string): Promise<E2EUser> {
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
  })
  if (error) {
    await service.auth.admin.deleteUser(userId)
    throw new Error(`E2E プロフィールの作成に失敗: ${error.message}`)
  }

  return { email, password: PASSWORD, userId, username }
}

/**
 * オンボーディング済み（`onboarded_at` あり・`status='active'`）のユーザーを作る。
 * middleware は `onboarded_at` を唯一の判定材料にするため、これが無いと保護ルートから
 * `/onboarding/profile` へ飛ばされる
 *   supabase/migrations/20260905130000_create_profiles.sql
 */
export async function createOnboardedUser(suffix: string): Promise<E2EUser> {
  const user = await createInProgressOnboardingUser(suffix)
  const service = serviceRoleClient()
  const { error } = await service
    .from('profiles')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', user.userId)
  if (error) {
    await service.auth.admin.deleteUser(user.userId)
    throw new Error(`E2E プロフィールの onboarded_at 更新に失敗: ${error.message}`)
  }
  return user
}

/** createOnboardedUser のadmin版。profiles.role は本人更新できないため service role で直接立てる */
export async function createOnboardedAdmin(suffix: string): Promise<E2EUser> {
  const user = await createOnboardedUser(suffix)
  const service = serviceRoleClient()
  const { error } = await service.from('profiles').update({ role: 'admin' }).eq('id', user.userId)
  if (error) throw new Error(`E2E admin への昇格に失敗: ${error.message}`)
  return user
}

export type E2EPendingConsentUser = E2EUser & { consentToken: string }

/**
 * 保護者同意待ち（`status='pending_consent'`）のユーザーを、有効なトークン付きで作る。
 * 生トークンはメールにしか載らない設計なので、テストからは戻り値の `consentToken`
 * （生の値）を「保護者がメールで受け取った値」として使う
 *   supabase/migrations/20260927010000_add_guardian_consent_token.sql
 */
export async function createPendingConsentUser(suffix: string): Promise<E2EPendingConsentUser> {
  const user = await createOnboardedUser(suffix)
  const service = serviceRoleClient()
  const consentToken = `e2e-consent-token-${randomToken(16)}`
  const tokenHash = createHash('sha256').update(consentToken).digest('hex')

  const { error } = await service
    .from('profiles')
    .update({
      status: 'pending_consent',
      guardian_email: `guardian-${suffix}@example.test`,
      guardian_consent_token_hash: tokenHash,
      guardian_consent_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    .eq('id', user.userId)
  if (error) throw new Error(`E2E 同意待ちユーザーの作成に失敗: ${error.message}`)

  return { ...user, consentToken }
}

export type E2ECafe = { id: string; name: string }

/**
 * 公開中（`status='active'`）のカフェ。これ以外は cafes の RLS が行ごと隠す。
 * `location` は `SRID=4326;POINT(lng lat)` 形式（S_CAFE_DETAIL の地図テストで使う）
 */
export async function createActiveCafe(
  suffix: string,
  overrides: { location?: string; area_code?: string } = {},
): Promise<E2ECafe> {
  const service = serviceRoleClient()
  const name = `E2E珈琲店 ${suffix}`

  const { data, error } = await service
    .from('cafes')
    .insert({ name, prefecture: '東京都', city: '渋谷区', status: 'active', ...overrides })
    .select('id')
    .single()

  if (error || !data) throw new Error(`E2E カフェの作成に失敗: ${error?.message}`)
  return { id: data.id as string, name }
}

export type E2EOwnerVerification = { id: string; cafeId: string; cafeName: string }

/** 審査待ち（status='pending'）のオーナー認証申請。書類2点以上の CHECK 制約を満たす */
export async function createPendingOwnerVerification(
  userId: string,
  suffix: string,
): Promise<E2EOwnerVerification> {
  const service = serviceRoleClient()
  const cafe = await createActiveCafe(suffix)

  const { data, error } = await service
    .from('cafe_owner_verifications')
    .insert({
      user_id: userId,
      cafe_id: cafe.id,
      document_urls: [
        { type: 'business_license', path: `${userId}/e2e-${suffix}/a.jpg` },
        { type: 'notification_of_business', path: `${userId}/e2e-${suffix}/b.pdf` },
      ],
      contact_email: `owner-${suffix}@example.test`,
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(`E2E オーナー認証申請の作成に失敗: ${error?.message}`)
  return { id: data.id as string, cafeId: cafe.id, cafeName: cafe.name }
}

export type E2EPost = { id: string; excerpt: string }

/**
 * 公開中の短文投稿。`published_at` は posts_set_published_at トリガーが補うが、
 * 明示的に渡せば上書きしない（並び順を固定したいページング検証用）
 * 抜粋は一覧・詳細のどちらでも投稿を名指しで掴めるよう、suffix を混ぜて一意にする
 */
export async function createPublishedPost(
  authorId: string,
  suffix: string,
  overrides: { publishedAt?: string; cafeId?: string } = {},
): Promise<E2EPost> {
  const service = serviceRoleClient()
  const excerpt = `E2Eいいねの投稿 ${suffix}`

  const { data, error } = await service
    .from('posts')
    .insert({
      author_id: authorId,
      body_json: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: excerpt }] }],
      },
      ...(overrides.publishedAt ? { published_at: overrides.publishedAt } : {}),
      ...(overrides.cafeId ? { cafe_id: overrides.cafeId } : {}),
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(`E2E 投稿の作成に失敗: ${error?.message}`)
  return { id: data.id as string, excerpt }
}

/** スラッグから厳選タグのIDを引く。docs/seed/curated-tags-initial-set.md のタグはseedではなくmigrationで入る */
export async function getTagIdBySlug(slug: string): Promise<string> {
  const service = serviceRoleClient()
  const { data, error } = await service.from('tags').select('id').eq('slug', slug).single()
  if (error || !data) throw new Error(`E2E タグの取得に失敗 (slug=${slug}): ${error?.message}`)
  return data.id as string
}

/**
 * テスト専用の使い捨てタグを作る。
 *  - 「おすすめ」タブのスコアリングは user_interest_tags / post_tags の一致を見るだけで
 *    投稿の作者やテストを区別しない
 *  - 'solo-time' 等の実在の厳選タグを使うと、並行実行中の別テスト（同じタグを使う別ファイル・
 *    同じファイルの別ブラウザプロジェクト）のデータまで一致数に乗ってランキング検証が崩れる
 *  - スラッグをテストごとに一意にすれば、一致は自分のテストが作った行だけに閉じる
 */
export async function createTestTag(suffix: string): Promise<{ id: string; slug: string }> {
  const service = serviceRoleClient()
  const slug = `e2e-${randomToken(10)}`
  const { data, error } = await service
    .from('tags')
    .insert({ slug, label: `E2Eテストタグ ${suffix}`, category: 'mood' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`E2E テストタグの作成に失敗: ${error?.message}`)
  return { id: data.id as string, slug }
}

/** S_HOME/S_EXPLORE「おすすめ」タブのスコアリング対象にする（user_interest_tags） */
export async function addInterestTag(userId: string, tagSlugOrId: string): Promise<void> {
  const service = serviceRoleClient()
  const tagId = await resolveTagId(tagSlugOrId)
  const { error } = await service
    .from('user_interest_tags')
    .insert({ user_id: userId, tag_id: tagId })
  if (error) throw new Error(`E2E 興味タグの登録に失敗: ${error.message}`)
}

/** 投稿にタグを付ける（post_tags）。mood チップ絞り込み・おすすめスコアリングの前提データ用 */
export async function tagPost(postId: string, tagSlugOrId: string): Promise<void> {
  const service = serviceRoleClient()
  const tagId = await resolveTagId(tagSlugOrId)
  const { error } = await service.from('post_tags').insert({ post_id: postId, tag_id: tagId })
  if (error) throw new Error(`E2E 投稿タグの登録に失敗: ${error.message}`)
}

/** UUID ならそのままID、そうでなければスラッグとして引く（createTestTag の戻り値とcurated slug両対応） */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
async function resolveTagId(tagSlugOrId: string): Promise<string> {
  return UUID_PATTERN.test(tagSlugOrId) ? tagSlugOrId : getTagIdBySlug(tagSlugOrId)
}

/** フォロー中タブの前提データ用。follows は RLS insert を本人限定にしているため service role で直接作る */
export async function followUser(followerId: string, followeeId: string): Promise<void> {
  const service = serviceRoleClient()
  const { error } = await service
    .from('follows')
    .insert({ follower_id: followerId, followee_id: followeeId })
  if (error) throw new Error(`E2E フォロー関係の作成に失敗: ${error.message}`)
}

/**
 * テストが作った行を消す。`user_cafe_lists` は profiles / cafes の双方から、
 * `posts` と `likes` は profiles から `on delete cascade` で落ちるので
 * 個別に消さなくてよい
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
