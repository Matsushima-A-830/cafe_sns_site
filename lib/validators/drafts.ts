import { z } from 'zod'
import { tiptapDocSchema } from './posts'

/**
 * drafts.payload のスキーマバージョン。フォームのデータ構造を変えたらこれを上げ、
 * 不一致の下書きはクライアント側で「古い下書きは使えません」と案内して破棄する
 *   docs/architecture/data-model/tables.md #drafts
 */
export const DRAFT_PAYLOAD_VERSION = 1

// client_draft_key は端末側で発行する UUID。長さ・文字種を絞り、
// jsonb のキーやURLに載せても壊れない形だけを受け付ける
const clientDraftKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9-]{8,64}$/, '下書きキーの形式が正しくありません')

/**
 * payload のキーは snake_case（DBに入る JSON そのもの）。TypeScript 側の
 * camelCase と混ぜないよう、変換は composer のフォーム層で明示的に行う
 */
export const draftPayloadSchema = z.object({
  v: z.literal(DRAFT_PAYLOAD_VERSION),
  // reservePost で確保した予約行の id。再開時に同じ行を使い回すために必須
  // （無いと再開のたびに予約行が増え、image_paths の postId とも食い違う）
  post_id: z.string().uuid(),
  post_type: z.enum(['short', 'blog']),
  title: z.string().max(100).nullable().default(null),
  body_json: tiptapDocSchema,
  tag_ids: z.array(z.string().uuid()).max(5).default([]),
  // createPost と同じ {author_id}/{post_id}/{uuid}.webp 規約。ここでは形のみ見る
  image_paths: z
    .array(z.string().regex(/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.webp$/))
    .max(10)
    .default([]),
  cafe_id: z.string().uuid().nullable().default(null),
})

export type DraftPayload = z.infer<typeof draftPayloadSchema>

export const saveDraftSchema = z.object({
  clientDraftKey: clientDraftKeySchema,
  payload: draftPayloadSchema,
})

export const draftKeySchema = z.object({
  clientDraftKey: clientDraftKeySchema,
})

export type SaveDraftInput = z.infer<typeof saveDraftSchema>
