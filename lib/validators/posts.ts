import { z } from 'zod'
import {
  NEW_MENU_IMAGE_MAX_COUNT,
  NEW_MENU_IMAGE_MIN_COUNT,
  OFFICIAL_FORMATS,
} from '@/lib/constants/posts'

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
  // reservePost で先に作成した hidden 投稿の id。createPost は Postgres 関数
  // finalize_post（RPC）でこの行を確定させる（docs/product/pending-items.md D17）
  postId: z.string().uuid('投稿IDの形式が正しくありません'),
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

// reservePost の入力。post_type は予約時に確定させ、finalize（createPost）側の
// postType と食い違わないことは finalize_post（RPC）の行ロック取得条件で検出する
//   supabase/migrations/20260911134931_finalize_post_rpc.sql
export const reservePostSchema = z.object({
  postType: z.enum(['short', 'blog']),
})

export type ReservePostInput = z.infer<typeof reservePostSchema>

// reservePost が posts.body_json（NOT NULL）に入れる空の Tiptap 文書。
// finalize までは表示されない（status='hidden'）ため中身は問わない
export const EMPTY_TIPTAP_DOC = { type: 'doc', content: [] }

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

// 二重送信の切り分け（getOwnPostStatus）で使う。createPost が FORBIDDEN を返したとき、
// クライアントは同じ postId の現在の status を確認して「先着が既に公開済み」か
// 「本当に権限が無い」かを判定する（docs/product/pending-items.md D17）
export const postIdSchema = z.object({
  postId: z.string().uuid('投稿IDの形式が正しくありません'),
})

// ============================================
// 公式投稿（S_POST_OFFICIAL, 幹C-2）
//   docs/design/wireframes/composer.md #S_POST_OFFICIAL
//   docs/architecture/data-model/tables.md #metadataのスキーマ公式投稿
// ============================================

// YYYY-MM-DD のみ許可。z.iso.date() ではなく imagePathSchema と同じ考え方で
// 正規表現に寄せ、zod のバージョン差に振り回されないようにする
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付の形式が正しくありません')

export const reserveOfficialPostSchema = z.object({
  officialFormat: z.enum(OFFICIAL_FORMATS),
})

export type ReserveOfficialPostInput = z.infer<typeof reserveOfficialPostSchema>

const officialImagePathsSchema = z
  .array(imagePathSchema)
  .default([])
  .transform((paths) => Array.from(new Set(paths)))
  .pipe(z.array(z.string()).max(10, '画像は10枚までです'))

// 新メニューはワイヤーの「写真（1〜3枚）」通り必須・上限3枚にする（他フォーマットより厳しい）
const newMenuImagePathsSchema = z
  .array(imagePathSchema)
  .transform((paths) => Array.from(new Set(paths)))
  .pipe(
    z
      .array(z.string())
      .min(NEW_MENU_IMAGE_MIN_COUNT, '写真は1枚以上選んでください')
      .max(NEW_MENU_IMAGE_MAX_COUNT, `写真は${NEW_MENU_IMAGE_MAX_COUNT}枚までです`),
  )

// menu_name/price_yen/valid_until/available_from/starts_on/ends_on/reason は
// tables.md #metadataのスキーマ公式投稿 に定義された固定キー。一言コメント・説明といった
// 自由文は metadata ではなく posts.body_json（Tiptap doc）に持たせる — 一般投稿と同じ
// 本文カラムに寄せることで body_text/body_search による全文検索の対象にも自然に乗る
const todaySpecialMetadataSchema = z.object({
  v: z.literal(1),
  menu_name: z
    .string()
    .trim()
    .min(1, 'メニュー名を入力してください')
    .max(60, 'メニュー名は60文字以内で入力してください'),
  price_yen: z.number().int().min(0).max(1_000_000).nullable(),
  // 「今日のみ」「〜今週末」は送信時にクライアントが具体的な日付へ変換する。「期限なし」は null
  valid_until: dateOnlySchema.nullable(),
})

const newMenuMetadataSchema = z.object({
  v: z.literal(1),
  menu_name: z
    .string()
    .trim()
    .min(1, 'メニュー名を入力してください')
    .max(60, 'メニュー名は60文字以内で入力してください'),
  price_yen: z.number().int().min(0).max(1_000_000).nullable(),
  available_from: dateOnlySchema,
})

const closureMetadataSchema = z
  .object({
    v: z.literal(1),
    closure_type: z.enum(['closed', 'hours_changed']),
    starts_on: dateOnlySchema,
    ends_on: dateOnlySchema,
    reason: z.string().trim().max(200, '理由は200文字以内で入力してください'),
  })
  .refine((data) => data.starts_on <= data.ends_on, {
    message: '終了日は開始日以降にしてください',
    path: ['ends_on'],
  })

const tipMetadataSchema = z.object({ v: z.literal(1) })

export const createOfficialPostSchema = z.discriminatedUnion('officialFormat', [
  z.object({
    officialFormat: z.literal('today_special'),
    postId: z.string().uuid('投稿IDの形式が正しくありません'),
    // 一言コメント。空文字も許可（写真だけの投稿を成立させる — short と同じ考え方）
    bodyJson: tiptapDocSchema,
    imagePaths: officialImagePathsSchema,
    metadata: todaySpecialMetadataSchema,
  }),
  z.object({
    officialFormat: z.literal('new_menu'),
    postId: z.string().uuid('投稿IDの形式が正しくありません'),
    bodyJson: tiptapDocSchema,
    imagePaths: newMenuImagePathsSchema,
    metadata: newMenuMetadataSchema,
  }),
  z.object({
    officialFormat: z.literal('closure'),
    postId: z.string().uuid('投稿IDの形式が正しくありません'),
    // 本文は metadata.reason から自動生成するため画像もクライアント入力も受け取らない
    metadata: closureMetadataSchema,
  }),
  z.object({
    officialFormat: z.literal('tip'),
    postId: z.string().uuid('投稿IDの形式が正しくありません'),
    title: z
      .string()
      .trim()
      .min(1, 'タイトルを入力してください')
      .max(100, 'タイトルは100文字以内で入力してください'),
    bodyJson: tiptapDocSchema,
    imagePaths: officialImagePathsSchema,
    metadata: tipMetadataSchema,
  }),
])

export type CreateOfficialPostInput = z.infer<typeof createOfficialPostSchema>
