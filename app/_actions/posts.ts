'use server'

import { checkAndAwardBadges } from '@/lib/badges/check'
import {
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_INSUFFICIENT_PRIVILEGE,
  POSTGRES_UNIQUE_VIOLATION,
} from '@/lib/constants/postgres-error-codes'
import { isPostStatus, type PostStatus } from '@/lib/constants/posts'
import { verifyNoGpsExif } from '@/lib/storage/post-image-verify'
import { deletePostImages } from '@/lib/storage/post-images'
import { createClient } from '@/lib/supabase/server'
import {
  createPostSchema,
  EMPTY_TIPTAP_DOC,
  extractPlainText,
  getBodyJsonByteSize,
  POST_BODY_MAX_JSON_BYTES,
  POST_BODY_MAX_PLAIN_CHARS,
  postIdSchema,
  reservePostSchema,
} from '@/lib/validators/posts'
import type { Json } from '@/types/database'
import type { Result } from '@/types/result'

// トリガーの raise exception は SQLSTATE P0001 固定で、コード自体がメッセージ文字列
// （POST_TAGS_LIMIT_EXCEEDED, FORBIDDEN 等）になる。
//   supabase/migrations/20260907120100 / 120200 / 20260911134931
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
  | 'NG_WORD_DETECTED'
  | 'EXIF_STRIP_FAILED'
  | 'INTERNAL_ERROR'

type ReservePostError = 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INTERNAL_ERROR'

type GetOwnPostStatusError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'POST_NOT_FOUND'
  | 'INTERNAL_ERROR'

type PostgrestLikeError = { code?: string | null; message: string } | null

function isRaisedWithMarker(error: PostgrestLikeError, marker: string): boolean {
  return error?.code === RAISED_BY_TRIGGER && error.message.includes(marker)
}

function isInsufficientPrivilege(error: PostgrestLikeError): boolean {
  return error?.code === POSTGRES_INSUFFICIENT_PRIVILEGE
}

function isUniqueViolation(error: PostgrestLikeError): boolean {
  return error?.code === POSTGRES_UNIQUE_VIOLATION
}

/**
 * composer 表示開始時（または最初の画像選択時）に空本文の hidden 投稿を予約作成する。
 * `POST /api/uploads/sign`（createPostImageUploadUrl）は is_post_author(postId) で
 * 「実在する自分の投稿」を要求するため、画像アップロードより前に posts 行が要る。
 * createPost（finalize）はこの行を insert ではなく RPC（finalize_post）で確定させる
 *   docs/product/pending-items.md D17
 */
export async function reservePost(
  input: unknown,
): Promise<Result<{ postId: string }, ReservePostError>> {
  const parsed = reservePostSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const postId = crypto.randomUUID()
  const { error } = await supabase.from('posts').insert({
    id: postId,
    author_id: user.id,
    post_type: parsed.data.postType,
    body_json: EMPTY_TIPTAP_DOC as Json,
    is_official: false,
    status: 'hidden',
  })

  if (error) {
    if (isInsufficientPrivilege(error)) return { ok: false, error: 'FORBIDDEN' }
    return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  }

  return { ok: true, data: { postId } }
}

/**
 * 一般投稿（is_official=false 固定）の finalize。公式投稿（オーナーの tip/today_special
 * 等）は metadata の official_format 別スキーマが必要になり複雑度が上がるため、
 * 別セッションのスコープとする
 *
 * postId は reservePost が先に作った hidden 投稿を指す（新規 insert はしない）。
 * 本文・タグ・画像の確定は Postgres 関数 `finalize_post`（RPC）に1回で任せる。
 *
 * 経緯: 本文 UPDATE → post_images/post_tags insert → status UPDATE を別々の文で
 * 行い失敗時にアプリ側で手動ロールバックする方式だったが、同じ postId への二重送信
 * （ダブルタップ・再送）で双方が本文 UPDATE を通過した後に insert が絡み合うと、
 * どちらも publish まで進めず画像・タグだけ入った hidden 投稿のまま行き詰まり、
 * 再送しても同じ一意制約違反で抜け出せなくなるケースがあった。`finalize_post` は
 * 対象行を `SELECT ... FOR UPDATE` でロックしてから本文更新・画像/タグ追加・公開更新を
 * 1トランザクションで行うため、同じ postId への同時呼び出しは自動的に直列化され、
 * 失敗時は関数全体が自動でロールバックする（手動の後始末が不要になる）
 *   docs/product/pending-items.md D17
 *   supabase/migrations/20260911134931_finalize_post_rpc.sql
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

  // post-images/{author_id}/{post_id}/{uuid}.webp 規約で、先頭セグメントが本人・
  // 第2セグメントがこの postId のものかを確認する。postId 側まで見ることで
  // 「他の自分の投稿から画像を横取りする」ことも防げる（パスは post_id ごとに
  // フォルダが分かれるため、postId が一致しない限りそもそも他人の画像パスにはならない）
  //   docs/architecture/data-model/README.md #オブジェクトパスの規約
  if (data.imagePaths.some((path) => !path.startsWith(`${user.id}/${data.postId}/`))) {
    return { ok: false, error: 'FORBIDDEN' }
  }

  // check_ng_words は ng_words の admin限定RLSを security definer でバイパスして
  // 参照する（authenticated からのみ実行可能）。severity=block のみ判定対象。
  // ブログのタイトルも判定対象に含める（本文だけ見ると title 単体のNGワードが素通りする）
  //   supabase/migrations/20260921040000_create_ng_words.sql
  const ngCheckText = data.postType === 'blog' ? `${data.title}\n${plainText}` : plainText
  const { data: ngWord, error: ngWordError } = await supabase.rpc('check_ng_words', {
    p_text: ngCheckText,
  })
  if (ngWordError) {
    return { ok: false, error: 'INTERNAL_ERROR', details: ngWordError.message }
  }
  if (ngWord) return { ok: false, error: 'NG_WORD_DETECTED' }

  // クライアント側の EXIF除去（processPostImage）を迂回されても GPS付き画像を公開しないための保険。
  // finalize_post 失敗時と異なり、検出した画像は再送しても使い回せない実害物なので Storage から削除する
  //   docs/product/pending-items.md A10
  if (data.imagePaths.length > 0) {
    const verified = await verifyNoGpsExif(supabase, data.imagePaths)
    if (!verified.ok) {
      if (verified.error === 'EXIF_STRIP_FAILED') {
        // 削除失敗を握り潰さない。EXIF_STRIP_FAILED は Sentry送信対象（error-catalog.md）
        // なので details に残せば「GPS付き画像がバケットに残った」ことが追跡できる
        const cleanup = await deletePostImages(supabase, data.imagePaths)
        if (!cleanup.ok) {
          return {
            ok: false,
            error: 'EXIF_STRIP_FAILED',
            details: { cleanupFailed: cleanup.details },
          }
        }
      }
      return verified
    }
  }

  const { error } = await supabase.rpc('finalize_post', {
    p_post_id: data.postId,
    p_post_type: data.postType,
    // 生成された型は Postgres 関数引数の NULL 許容を表現できず string 固定になるが、
    // plpgsql 関数はどの引数にも NULL を渡せる（title/cafe_id は実際に NULL を渡す）
    p_title: (data.postType === 'blog' ? data.title : null) as string,
    // Tiptap JSON はエディタが生成する JSON シリアライズ可能な構造であり Json 互換。
    // z.record(z.string(), z.unknown()) の型では静的に保証できないためここでキャストする
    p_body_json: data.bodyJson as Json,
    p_visibility: data.visibility,
    p_cafe_id: (data.cafeId ?? null) as string,
    p_image_paths: data.imagePaths,
    p_tag_ids: data.tagIds,
  })

  if (error) {
    // finalize_post が失敗しても Storage の画像は消さない。予約行（hidden のまま）と
    // そのフォルダ（{author_id}/{postId}/）はどちらも残るため、画像は「孤立」しておらず
    // 再送でそのまま使い直せる想定のものである。ここで消してしまうと、ユーザーがカフェを
    // 選び直す等して同じ postId・imagePaths で再送したとき、post_images には Storage との
    // FK が無いため insert 自体は成功してしまい、画像ファイルが存在しない投稿がそのまま
    // 公開されてしまう（`/code-review` で指摘）。本当に放置された予約行・画像は
    // D19 の掃除処理でまとめて扱う
    if (isRaisedWithMarker(error, 'FORBIDDEN')) {
      return { ok: false, error: 'FORBIDDEN' }
    }
    if (
      error.code === POSTGRES_FOREIGN_KEY_VIOLATION &&
      error.message.includes(POSTS_CAFE_ID_FKEY)
    ) {
      return { ok: false, error: 'CAFE_NOT_FOUND' }
    }
    if (isRaisedWithMarker(error, 'POST_IMAGES_LIMIT_EXCEEDED')) {
      return { ok: false, error: 'POST_IMAGES_LIMIT_EXCEEDED' }
    }
    if (isRaisedWithMarker(error, 'POST_TAGS_LIMIT_EXCEEDED')) {
      return { ok: false, error: 'POST_TAGS_LIMIT_EXCEEDED' }
    }
    if (isInsufficientPrivilege(error)) {
      return { ok: false, error: 'FORBIDDEN' }
    }
    // 行ロックによる直列化で本来到達しないはずだが、想定外の重複挿入に対する保険
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'CONFLICT' }
    }
    return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  }

  // POST_*/AREA_*/SCENE_* バッジの判定（docs/seed/badges-initial-set.md #判定タイミング）。
  // 失敗しても投稿自体は成功として返す（lib/badges/check.ts が個別に握る）
  await checkAndAwardBadges(supabase, user.id, 'POST_CREATED')

  return { ok: true, data: { postId: data.postId } }
}

/**
 * 自分の投稿の現在の status を返す。用途は createPost が FORBIDDEN を返したときの切り分け。
 *
 * finalize_post は同じ postId への同時呼び出しを行ロックで直列化するため、二重送信
 * （ダブルタップ・ネットワーク再送）の後着は「既に公開済みの行」に対する finalize となり
 * FORBIDDEN を受け取る。つまり FORBIDDEN は「本当に権限が無い」と「先着が既に成功した」の
 * 両方を意味し得る。クライアントはこれを呼んで published なら成功として扱う
 *   docs/product/pending-items.md D17
 *
 * RLS の posts_select_own により、作者本人は status を問わず自分の投稿を読める。
 * 他人の投稿・存在しない投稿はどちらも行が見えず POST_NOT_FOUND になる（存在を漏らさない）
 */
export async function getOwnPostStatus(
  input: unknown,
): Promise<Result<{ status: PostStatus }, GetOwnPostStatusError>> {
  const parsed = postIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { data, error } = await supabase
    .from('posts')
    .select('status')
    .eq('id', parsed.data.postId)
    .eq('author_id', user.id)
    .maybeSingle()

  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  if (!data) return { ok: false, error: 'POST_NOT_FOUND' }
  // CHECK 制約があるので通常ここは通らない。呼び出し側が status を文字列比較で
  // 取り違えないよう、型を絞れなかった場合は成功として返さない
  if (!isPostStatus(data.status)) {
    return { ok: false, error: 'INTERNAL_ERROR', details: `未知の status: ${data.status}` }
  }

  return { ok: true, data: { status: data.status } }
}
