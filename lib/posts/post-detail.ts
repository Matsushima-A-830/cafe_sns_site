import type { SupabaseClient } from '@supabase/supabase-js'
import { getPostImagePublicUrl } from '@/lib/storage/post-images'
import { extractPlainText } from '@/lib/validators/posts'
import type { Database } from '@/types/database'

/**
 * 投稿詳細（S_POST_DETAIL）の読み取り。Server Actions ではなくここに置くのは、
 * このページが ISR（revalidate=300）の Server Component から呼ぶ純粋な読み取りだから。
 *   docs/architecture/routing.md #URLとスクリーンIDの対応表
 */

const TITLE_FALLBACK_LENGTH = 30
const DESCRIPTION_LENGTH = 120

type Client = SupabaseClient<Database>

export type PostDetailImage = { url: string; altText: string }
export type PostDetailTag = { id: string; slug: string; label: string }

export type PostDetail = {
  id: string
  postType: 'short' | 'blog'
  title: string | null
  bodyJson: unknown
  visibility: string
  publishedAt: string
  author: { id: string; username: string; displayName: string; avatarUrl: string | null }
  cafe: { id: string; name: string; areaLabel: string | null } | null
  images: PostDetailImage[]
  tags: PostDetailTag[]
}

/** 1クエリで投稿・作者・カフェ・画像・タグをまとめて取る（N+1回避） */
const POST_DETAIL_SELECT = `
  id, post_type, title, body_json, visibility, published_at, created_at,
  author:profiles!posts_author_id_fkey (id, username, display_name, avatar_url),
  cafe:cafes!posts_cafe_id_fkey (id, name, area_code, areas!cafes_area_code_fkey (label)),
  post_images (storage_path, alt_text, display_order),
  post_tags (tags (id, slug, label))
` as const

type PostDetailRow = {
  id: string
  post_type: string
  title: string | null
  body_json: unknown
  visibility: string
  published_at: string | null
  created_at: string
  author: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
  } | null
  cafe: {
    id: string
    name: string
    area_code: string | null
    areas: { label: string } | null
  } | null
  post_images: { storage_path: string; alt_text: string | null; display_order: number }[]
  post_tags: { tags: { id: string; slug: string; label: string } | null }[]
}

export function postPlainText(bodyJson: unknown): string {
  return extractPlainText(bodyJson).replace(/\s+/g, ' ').trim()
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/** タイトルが無い短文投稿は本文の冒頭を見出し代わりにする（routing.md メタデータ・OG設計） */
export function postDisplayTitle(title: string | null, bodyJson: unknown): string {
  const trimmed = title?.trim()
  if (trimmed) return trimmed
  const plain = postPlainText(bodyJson)
  // 写真だけの短文投稿は本文が空になり得る
  return plain.length > 0 ? truncate(plain, TITLE_FALLBACK_LENGTH) : '投稿'
}

export function postDescription(bodyJson: unknown): string {
  return truncate(postPlainText(bodyJson), DESCRIPTION_LENGTH)
}

export function toPostDetail(
  row: PostDetailRow,
  toPublicUrl: (path: string) => string,
): PostDetail {
  return {
    id: row.id,
    // CHECK 制約があるので通常 short/blog 以外は来ない。未知の値でレイアウトを
    // 出し分け不能にするより、短文として素直に表示する
    postType: row.post_type === 'blog' ? 'blog' : 'short',
    title: row.title,
    bodyJson: row.body_json,
    visibility: row.visibility,
    // published_at は finalize_post が入れるが、NOT NULL ではないため保険を置く
    publishedAt: row.published_at ?? row.created_at,
    author: {
      id: row.author?.id ?? '',
      username: row.author?.username ?? '',
      displayName: row.author?.display_name ?? '退会したユーザー',
      avatarUrl: row.author?.avatar_url ?? null,
    },
    cafe: row.cafe
      ? { id: row.cafe.id, name: row.cafe.name, areaLabel: row.cafe.areas?.label ?? null }
      : null,
    images: [...row.post_images]
      .sort((a, b) => a.display_order - b.display_order)
      .map((image) => ({
        url: toPublicUrl(image.storage_path),
        // alt の入力導線が無いため実質すべて空（装飾扱い）になる
        //   docs/product/pending-items.md D22
        altText: image.alt_text ?? '',
      })),
    tags: row.post_tags
      .map((entry) => entry.tags)
      .filter((tag): tag is PostDetailTag => tag !== null),
  }
}

/**
 * 公開中の投稿を1件取得する。該当行が無ければ null、取得自体に失敗したら例外。
 *
 * 失敗を null に丸めない: 通信エラーや設定ミスまで「投稿が無い」ことにすると、
 * 実在する投稿が静かに 404 になり原因も残らない（キャッシュが効けば404ごと固定される）
 *
 * `status='published'` と `deleted_at is null` は必ずここで明示する。RLS の
 * posts_select_own（author_id 一致のみ）が OR で合成されるため、作者本人が見ると
 * hidden な予約行（reservePost が作る空投稿）や論理削除済みの投稿まで返ってしまう
 *   supabase/migrations/20260910120000_fix_posts_select_own.sql
 *   docs/architecture/data-model/tables.md #posts
 */
export async function getPostDetail(supabase: Client, postId: string): Promise<PostDetail | null> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_DETAIL_SELECT)
    .eq('id', postId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    throw new Error(`投稿の取得に失敗しました (id=${postId}): ${error.message}`)
  }
  if (!data) return null

  return toPostDetail(data as PostDetailRow, (path) => getPostImagePublicUrl(supabase, path))
}
