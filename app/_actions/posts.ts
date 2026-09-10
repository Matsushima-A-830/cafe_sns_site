'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_INSUFFICIENT_PRIVILEGE,
} from '@/lib/constants/postgres-error-codes'
import { deletePostImages } from '@/lib/storage/post-images'
import { createClient } from '@/lib/supabase/server'
import {
  createPostSchema,
  extractPlainText,
  getBodyJsonByteSize,
  POST_BODY_MAX_JSON_BYTES,
  POST_BODY_MAX_PLAIN_CHARS,
} from '@/lib/validators/posts'
import type { Database, Json } from '@/types/database'
import type { Result } from '@/types/result'

// トリガーの raise exception は SQLSTATE P0001 固定で、コード自体がメッセージ文字列
// （POST_TAGS_LIMIT_EXCEEDED 等）になる。supabase/migrations/20260907120100 / 120200
const RAISED_BY_TRIGGER = 'P0001'
// posts.cafe_id → cafes への外部キー制約名。author_id 側（posts_author_id_fkey）と
// 区別するため message にこの制約名が含まれるかで判定する
//   types/database.ts posts.Relationships
const POSTS_CAFE_ID_FKEY = 'posts_cafe_id_fkey'

type CreatePostError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'POST_BODY_EMPTY'
  | 'POST_BODY_TOO_LONG'
  | 'CAFE_NOT_FOUND'
  | 'POST_IMAGES_LIMIT_EXCEEDED'
  | 'POST_TAGS_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR'

type PostgrestLikeError = { code?: string | null; message: string } | null

function isTriggerError(error: PostgrestLikeError, marker: string): boolean {
  return error?.code === RAISED_BY_TRIGGER && error.message.includes(marker)
}

function isInsufficientPrivilege(error: PostgrestLikeError): boolean {
  return error?.code === POSTGRES_INSUFFICIENT_PRIVILEGE
}

/**
 * post_images/post_tags の書き込みが失敗した際の手動ロールバック。
 * posts 行を削除（cascade で post_images/post_tags も道連れに消える）し、
 * 画像は post_images 行の INSERT 失敗時点で既に Storage にアップロード済みのため
 * deletePostImages で孤立オブジェクトも合わせて消す。
 * どちらの削除が失敗しても呼び出し元へ返すエラーを変えても救えないため、ログに残すに留める
 */
async function rollbackPost(
  supabase: SupabaseClient<Database>,
  postId: string,
  imagePaths: string[],
): Promise<void> {
  const deleteImagesResult = await deletePostImages(supabase, imagePaths)
  if (!deleteImagesResult.ok) {
    console.error('createPost: ロールバックの画像削除に失敗', postId, deleteImagesResult)
  }
  const { error } = await supabase.from('posts').delete().eq('id', postId)
  if (error) {
    console.error('createPost: ロールバックのpost削除に失敗', postId, error)
  }
}

/**
 * 一般投稿（is_official=false 固定）の新規作成。公式投稿（オーナーの tip/today_special
 * 等）は metadata の official_format 別スキーマが必要になり複雑度が上がるため、
 * 別セッションのスコープとする
 *
 * id はここで生成して INSERT に明示的に渡す（.select().single() で返り値から拾わない）。
 * post_images/post_tags を書き込む後続ステップで postId が必要なため、DBラウンド
 * トリップを待たずここで確定させる。posts_select_own（作者は status を問わず自分の
 * 投稿を読める）により RETURNING 自体は今は機能するが、単に不要な出力を求めないだけ
 *
 * posts を status='hidden' で作成（is_post_author() は status を問わず判定するため
 * post_images/post_tags の INSERT は通る）→ post_images/post_tags を書き込み →
 * 最後に status='published' へ更新する。先に published で作ると、画像・タグの書き込みが
 * 失敗してロールバックするまでの間、本文だけの不完全な投稿が他ユーザーに公開されてしまうため
 *
 * 注意: PostgreSQL の RLS は UPDATE/DELETE の対象行を特定する際にも SELECT
 * ポリシーの USING を適用する。posts_select（status='published' must）だけでは
 * 作者本人でも hidden/archived な自分の投稿を UPDATE/DELETE できず対象0件のまま
 * エラーなしで終わってしまうため、posts_select_own（author_id = auth.uid() のみ、
 * status/deleted_at 不問）を追加して解消した。この関数の「hidden→published の
 * 更新」と rollbackPost の DELETE はどちらもこのポリシーに依存する
 *   docs/architecture/data-model/tables.md #posts #post_images #post_tags
 *   supabase/migrations/20260910120000_fix_posts_select_own.sql
 */
export async function createPost(
  input: unknown,
): Promise<Result<{ postId: string }, CreatePostError>> {
  const parsed = createPostSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }
  const data = parsed.data

  // Server Actions は事実上公開エンドポイント。本文の再帰処理より前に認証を確認し、
  // 未ログインの相手に extractPlainText / JSON.stringify の計算コストを負わせない
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  // NGワード検出はNGワード辞書が未整備のため今回のスコープでは実装しない
  // (pending-items.md B4 が未決)
  const plainText = extractPlainText(data.bodyJson)
  // 短文投稿は写真1枚以上あれば本文なしでも投稿できる（S_POST_SHORT の「写真＋短文」導線）
  const allowsEmptyBody = data.postType === 'short' && data.imagePaths.length > 0
  if (plainText.trim().length === 0 && !allowsEmptyBody) {
    return { ok: false, error: 'POST_BODY_EMPTY' }
  }
  if (plainText.length > POST_BODY_MAX_PLAIN_CHARS) {
    return { ok: false, error: 'POST_BODY_TOO_LONG' }
  }
  const bodyJsonByteSize = getBodyJsonByteSize(data.bodyJson)
  if (bodyJsonByteSize === null || bodyJsonByteSize > POST_BODY_MAX_JSON_BYTES) {
    return { ok: false, error: 'POST_BODY_TOO_LONG' }
  }

  // post-images/{author_id}/{post_id}/{uuid}.webp 規約の先頭セグメントが本人のものかを
  // 確認する。ここを飛ばすと他人の author_id フォルダのパスをそのまま post_images に
  // 書き込め、post_images の RLS（is_post_author(post_id) のみ判定）では防げない
  //   docs/architecture/data-model/README.md #オブジェクトパスの規約
  if (data.imagePaths.some((path) => !path.startsWith(`${user.id}/`))) {
    return { ok: false, error: 'FORBIDDEN' }
  }

  // imagePaths は POST /api/uploads/sign で「既存の別投稿」に対して発行済みのパスしか
  // 得られない（is_post_author 必須のため）。ここで既に post_images に登録済みのパスを
  // 弾かないと、他の投稿から画像を横取りできてしまう上、この呼び出しが後続で失敗した際の
  // rollbackPost が Storage の実体を削除し、元の投稿の画像まで壊してしまう
  if (data.imagePaths.length > 0) {
    const { count, error: existingImagesError } = await supabase
      .from('post_images')
      .select('id', { count: 'exact', head: true })
      .in('storage_path', data.imagePaths)

    if (existingImagesError) {
      return { ok: false, error: 'INTERNAL_ERROR', details: existingImagesError.message }
    }
    if ((count ?? 0) > 0) {
      return { ok: false, error: 'CONFLICT' }
    }
  }

  const postId = crypto.randomUUID()

  const { error: postError } = await supabase.from('posts').insert({
    id: postId,
    author_id: user.id,
    cafe_id: data.cafeId ?? null,
    post_type: data.postType,
    title: data.postType === 'blog' ? data.title : null,
    // Tiptap JSON はエディタが生成する JSON シリアライズ可能な構造であり Json 互換。
    // z.record(z.string(), z.unknown()) の型では静的に保証できないためここでキャストする
    body_json: data.bodyJson as Json,
    visibility: data.visibility,
    is_official: false,
    status: 'hidden',
  })

  if (postError) {
    // FK は cafe_id / author_id の2本。制約名で区別しないと、profiles 行を持たない
    // ユーザーの author_id 違反まで「カフェが見つかりません」と誤表示してしまう
    if (
      postError.code === POSTGRES_FOREIGN_KEY_VIOLATION &&
      postError.message.includes(POSTS_CAFE_ID_FKEY)
    ) {
      return { ok: false, error: 'CAFE_NOT_FOUND' }
    }
    if (isInsufficientPrivilege(postError)) {
      return { ok: false, error: 'FORBIDDEN' }
    }
    return { ok: false, error: 'INTERNAL_ERROR', details: postError.message }
  }

  // post_images / post_tags はどちらも postId のみに依存し互いに独立しているため並列化する
  // （lib/storage/post-images.ts createPostImageUploadUrl と同じ考え方）
  const [imagesResult, tagsResult] = await Promise.all([
    data.imagePaths.length > 0
      ? supabase.from('post_images').insert(
          data.imagePaths.map((storage_path, index) => ({
            post_id: postId,
            storage_path,
            display_order: index,
          })),
        )
      : Promise.resolve({ error: null }),
    data.tagIds.length > 0
      ? supabase
          .from('post_tags')
          .insert(data.tagIds.map((tag_id) => ({ post_id: postId, tag_id })))
      : Promise.resolve({ error: null }),
  ])

  if (imagesResult.error || tagsResult.error) {
    await rollbackPost(supabase, postId, data.imagePaths)

    if (isTriggerError(imagesResult.error, 'POST_IMAGES_LIMIT_EXCEEDED')) {
      return { ok: false, error: 'POST_IMAGES_LIMIT_EXCEEDED' }
    }
    if (isTriggerError(tagsResult.error, 'POST_TAGS_LIMIT_EXCEEDED')) {
      return { ok: false, error: 'POST_TAGS_LIMIT_EXCEEDED' }
    }
    if (isInsufficientPrivilege(imagesResult.error) || isInsufficientPrivilege(tagsResult.error)) {
      return { ok: false, error: 'FORBIDDEN' }
    }
    return {
      ok: false,
      error: 'INTERNAL_ERROR',
      details: imagesResult.error?.message ?? tagsResult.error?.message,
    }
  }

  const { error: publishError } = await supabase
    .from('posts')
    .update({ status: 'published' })
    .eq('id', postId)

  if (publishError) {
    await rollbackPost(supabase, postId, data.imagePaths)
    if (isInsufficientPrivilege(publishError)) {
      return { ok: false, error: 'FORBIDDEN' }
    }
    return { ok: false, error: 'INTERNAL_ERROR', details: publishError.message }
  }

  return { ok: true, data: { postId } }
}
