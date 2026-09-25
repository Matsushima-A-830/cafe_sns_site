'use server'

import {
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_INSUFFICIENT_PRIVILEGE,
  POSTGRES_UNIQUE_VIOLATION,
} from '@/lib/constants/postgres-error-codes'
import { officialFormatPostType } from '@/lib/constants/posts'
import { getOwnedCafe } from '@/lib/owner/dashboard'
import { verifyNoGpsExif } from '@/lib/storage/post-image-verify'
import { deletePostImages } from '@/lib/storage/post-images'
import { createClient } from '@/lib/supabase/server'
import {
  createOfficialPostSchema,
  EMPTY_TIPTAP_DOC,
  extractPlainText,
  getBodyJsonByteSize,
  POST_BODY_MAX_JSON_BYTES,
  POST_BODY_MAX_PLAIN_CHARS,
  reserveOfficialPostSchema,
} from '@/lib/validators/posts'
import type { Json } from '@/types/database'
import type { Result } from '@/types/result'

// finalize_post と同じく P0001（raise exception）固定。メッセージ文字列自体がコードになる
//   supabase/migrations/20260921211943_official_posts_finalize.sql
const RAISED_BY_TRIGGER = 'P0001'
const POSTS_CAFE_ID_FKEY = 'posts_cafe_id_fkey'

type ReserveOfficialPostError = 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'NOT_OWNER' | 'INTERNAL_ERROR'

type CreateOfficialPostError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'POST_BODY_TOO_LONG'
  | 'CAFE_NOT_FOUND'
  | 'POST_IMAGES_LIMIT_EXCEEDED'
  | 'NG_WORD_DETECTED'
  | 'EXIF_STRIP_FAILED'
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
 * S_POST_OFFICIAL のフォーマット選択直後に hidden 予約行を作る。ImagePicker /
 * TiptapEditor が画像アップロード時に is_post_author(postId) を要求するため、
 * reservePost（一般投稿）と同じ理由で finalize より前に posts 行が要る
 *   docs/product/pending-items.md D17
 *
 * 対象カフェは URL に持たせず（routing.md #ロールとゲート方針）、呼び出し元本人が
 * verified_owner_id のカフェを getOwnedCafe で解決する。複数カフェオーナーは
 * 先頭1件のみ（pending-items 複数店舗オーナー一覧UI 未実装）
 */
export async function reserveOfficialPost(
  input: unknown,
): Promise<Result<{ postId: string; cafeId: string; cafeName: string }, ReserveOfficialPostError>> {
  const parsed = reserveOfficialPostSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const cafe = await getOwnedCafe(supabase)
  if (!cafe) return { ok: false, error: 'NOT_OWNER' }

  const postId = crypto.randomUUID()
  const { error } = await supabase.from('posts').insert({
    id: postId,
    author_id: user.id,
    cafe_id: cafe.id,
    post_type: officialFormatPostType(parsed.data.officialFormat),
    official_format: parsed.data.officialFormat,
    body_json: EMPTY_TIPTAP_DOC as Json,
    is_official: true,
    status: 'hidden',
  })

  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }

  return { ok: true, data: { postId, cafeId: cafe.id, cafeName: cafe.name } }
}

/**
 * reserveOfficialPost が作った hidden 予約行を、タイトル/本文/metadata/画像込みで
 * 公開確定させる。finalize_official_post（RPC）に1回で任せる — createPost と同じ理由
 *   supabase/migrations/20260921211943_official_posts_finalize.sql
 */
export async function createOfficialPost(
  input: unknown,
): Promise<Result<{ postId: string }, CreateOfficialPostError>> {
  const parsed = createOfficialPostSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }
  const data = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const title = data.officialFormat === 'tip' ? data.title : null
  // closure は自由入力欄を持たず、metadata.reason をそのまま本文にする
  // （一覧・詳細の body_text/body_search 検索対象に乗せるため）
  const bodyJson: Json =
    data.officialFormat === 'closure'
      ? (reasonToTiptapDoc(data.metadata.reason) as Json)
      : (data.bodyJson as Json)

  const plainText = extractPlainText(bodyJson)
  if (plainText.length > POST_BODY_MAX_PLAIN_CHARS) {
    return { ok: false, error: 'POST_BODY_TOO_LONG' }
  }
  const bodyJsonByteSize = getBodyJsonByteSize(bodyJson)
  if (bodyJsonByteSize === null || bodyJsonByteSize > POST_BODY_MAX_JSON_BYTES) {
    return { ok: false, error: 'POST_BODY_TOO_LONG' }
  }

  const imagePaths = data.officialFormat === 'closure' ? [] : data.imagePaths
  // post-images/{author_id}/{post_id}/{uuid}.webp 規約。createPost と同じ検証
  //   docs/architecture/data-model/README.md #オブジェクトパスの規約
  if (imagePaths.some((path) => !path.startsWith(`${user.id}/${data.postId}/`))) {
    return { ok: false, error: 'FORBIDDEN' }
  }

  const ngCheckParts = [plainText]
  if (title) ngCheckParts.unshift(title)
  if (data.officialFormat === 'today_special' || data.officialFormat === 'new_menu') {
    ngCheckParts.push(data.metadata.menu_name)
  }
  const { data: ngWord, error: ngWordError } = await supabase.rpc('check_ng_words', {
    p_text: ngCheckParts.join('\n'),
  })
  if (ngWordError) return { ok: false, error: 'INTERNAL_ERROR', details: ngWordError.message }
  if (ngWord) return { ok: false, error: 'NG_WORD_DETECTED' }

  // createPost と同じ保険（クライアント側 EXIF除去の迂回対策）
  //   docs/product/pending-items.md A10
  if (imagePaths.length > 0) {
    const verified = await verifyNoGpsExif(supabase, imagePaths)
    if (!verified.ok) {
      if (verified.error === 'EXIF_STRIP_FAILED') {
        await deletePostImages(supabase, imagePaths)
      }
      return verified
    }
  }

  const { error } = await supabase.rpc('finalize_official_post', {
    p_post_id: data.postId,
    // 予約時の official_format と一致しない postId には対象0件（FORBIDDEN）になる。
    // 例えば closure で予約した postId に tip のペイロードを送るような不整合を防ぐ
    p_official_format: data.officialFormat,
    // 生成された型は Postgres 関数引数の NULL 許容を表現できず string 固定になるが、
    // plpgsql 関数はどの引数にも NULL を渡せる（createPost と同じキャスト）
    p_title: title as string,
    p_body_json: bodyJson,
    p_metadata: data.metadata as Json,
    p_image_paths: imagePaths,
  })

  if (error) {
    if (isRaisedWithMarker(error, 'FORBIDDEN')) return { ok: false, error: 'FORBIDDEN' }
    if (
      error.code === POSTGRES_FOREIGN_KEY_VIOLATION &&
      error.message.includes(POSTS_CAFE_ID_FKEY)
    ) {
      return { ok: false, error: 'CAFE_NOT_FOUND' }
    }
    if (isRaisedWithMarker(error, 'POST_IMAGES_LIMIT_EXCEEDED')) {
      return { ok: false, error: 'POST_IMAGES_LIMIT_EXCEEDED' }
    }
    if (isInsufficientPrivilege(error)) return { ok: false, error: 'FORBIDDEN' }
    if (isUniqueViolation(error)) return { ok: false, error: 'CONFLICT' }
    return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  }

  return { ok: true, data: { postId: data.postId } }
}

/** 臨時休業の「理由」だけを1段落の Tiptap doc にする。空文字は EMPTY_TIPTAP_DOC のまま */
function reasonToTiptapDoc(reason: string): Record<string, unknown> {
  if (reason.length === 0) return { ...EMPTY_TIPTAP_DOC }
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: reason }] }],
  }
}
