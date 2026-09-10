import { z } from 'zod'

// Tiptap JSON の中身そのものは検証しない（エディタが生成する構造を信頼する）。
// 空文言・サイズ上限チェックは extractPlainText 経由でアプリ層（createPost）が行う
// docs/architecture/data-model/tables.md #posts
export const tiptapDocSchema = z.record(z.string(), z.unknown())

// docs/architecture/data-model/tables.md #posts 本文サイズ上限
export const POST_BODY_MAX_PLAIN_CHARS = 50_000
export const POST_BODY_MAX_JSON_BYTES = 512 * 1024
// 通常の Tiptap 文書は数十段も潜らない。この上限は「悪意ある/壊れた入力で
// extractPlainText が再帰しすぎてスタックオーバーフローする」のを防ぐための保険
const MAX_TIPTAP_DEPTH = 64

// post_images.storage_path の規約: {author_id}/{post_id}/{uuid}.webp
// lib/storage/post-images.ts buildPostImagePath と同じ形。サイズ・MIME検証は
// アップロード時（createPostImageUploadUrl）に既に済んでいるため、ここでは
// 形だけを検証する（uploads.ts と同じ考え方 — 重複判定はズレの元）。
// セグメントは英数字・アンダースコア・ハイフンのみ許可し、`..` によるパストラバーサルや
// 余分な `/` 混入を防ぐ（所有者一致チェックは createPost 側で行う）
const imagePathSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.webp$/,
    '画像パスの形式が正しくありません',
  )

const basePostFields = {
  cafeId: z.string().uuid('カフェIDの形式が正しくありません').optional(),
  // DBトリガー enforce_post_tags_limit / enforce_post_images_limit が正の判定を行う。
  // ここでの上限チェックは「明らかに多すぎる入力を早期に弾く」程度に留める。
  // 重複IDは post_tags の主キー (post_id, tag_id) 違反を招くため去重してから上限を数える
  // （去重前に max() をかけると、実際は上限内なのに重複分で弾かれてしまう）
  tagIds: z
    .array(z.string().uuid())
    .default([])
    .transform((ids) => Array.from(new Set(ids)))
    .pipe(z.array(z.string()).max(5, 'タグは5個までです')),
  // 重複パスは post_images に同じ画像が複数行入る事故になるため、tagIds と同様に去重する
  imagePaths: z
    .array(imagePathSchema)
    .default([])
    .transform((paths) => Array.from(new Set(paths)))
    .pipe(z.array(z.string()).max(10, '画像は10枚までです')),
  visibility: z.enum(['public', 'followers']).default('public'),
  bodyJson: tiptapDocSchema,
}

export const createPostSchema = z.discriminatedUnion('postType', [
  z.object({
    postType: z.literal('short'),
    ...basePostFields,
  }),
  z.object({
    postType: z.literal('blog'),
    title: z
      .string()
      .trim()
      .min(1, 'タイトルを入力してください')
      .max(100, 'タイトルは100文字以内で入力してください'),
    ...basePostFields,
  }),
])

export type CreatePostInput = z.infer<typeof createPostSchema>

/**
 * Tiptap JSON からテキストリーフを連結する。DB の tiptap_to_plaintext（SQL の
 * `jsonpath_query(doc, 'strict $.** ? (@.type == "text")')`）と同じく、
 * 深さを問わず全階層を辿って type === "text" のリーフを集める。
 * MAX_TIPTAP_DEPTH を超えたら打ち切り、異常に深いJSONでのスタックオーバーフローを防ぐ
 *   supabase/migrations/20260905120000_init_extensions_and_functions.sql
 */
export function extractPlainText(node: unknown, depth = 0): string {
  if (depth > MAX_TIPTAP_DEPTH) return ''
  if (node === null || typeof node !== 'object') return ''

  if (Array.isArray(node)) {
    return node
      .map((item) => extractPlainText(item, depth + 1))
      .filter(Boolean)
      .join(' ')
  }

  const record = node as Record<string, unknown>
  const parts: string[] = []
  if (record.type === 'text' && typeof record.text === 'string') {
    parts.push(record.text)
  }
  // content 以外のキー（marks 配下等）にも潜り得るため、text/type 以外の全値を再帰的に辿る
  for (const [key, value] of Object.entries(record)) {
    if (key === 'text' || key === 'type') continue
    const extracted = extractPlainText(value, depth + 1)
    if (extracted) parts.push(extracted)
  }
  return parts.filter(Boolean).join(' ')
}

/**
 * bodyJson の JSON バイトサイズを計測する。JSON.stringify は異常に深いネストで
 * スタックオーバーフローし得るため、その場合は null を返し呼び出し元に「不正入力」として
 * 扱わせる（例外を Server Action の外まで伝播させない）
 */
export function getBodyJsonByteSize(bodyJson: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(bodyJson)).length
  } catch {
    return null
  }
}
