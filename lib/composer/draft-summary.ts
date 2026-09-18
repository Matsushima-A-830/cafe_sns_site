import { tiptapDocToText } from '@/lib/composer/tiptap'
import type { DraftPayload } from '@/lib/validators/drafts'

/**
 * 下書きの一覧表示（/new のエントリシート・S_DRAFTS）で共通に使う要約。
 *
 * 再開先のパス決定をコピーで持たないためにここへ置く。post_type とルートの対応が
 * 片方だけずれると「続きを書く」が別のフォームを開き、下書きが復元されない
 */

/** 一覧のプレビューに出す文字数。長い本文で行が崩れるのを防ぐだけの値 */
export const DRAFT_PREVIEW_MAX_CHARS = 40

type DraftLike = { clientDraftKey: string; payload: DraftPayload }

/** タイトル優先、無ければ本文の冒頭。どちらも空の下書きもありうる */
export function draftPreviewText(draft: DraftLike, maxChars = DRAFT_PREVIEW_MAX_CHARS): string {
  const body = tiptapDocToText(draft.payload.body_json).trim()
  const text = draft.payload.title?.trim() || body || '（本文なし）'
  // 絵文字などのサロゲートペアを途中で割らないようコードポイント単位で数える（postExcerpt と同じ）
  const chars = Array.from(text)
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join('')}…` : text
}

export function draftResumeHref(draft: DraftLike): string {
  const path = draft.payload.post_type === 'blog' ? '/new/blog' : '/new/short'
  return `${path}?draft=${encodeURIComponent(draft.clientDraftKey)}`
}

export function draftPostTypeLabel(draft: DraftLike): string {
  return draft.payload.post_type === 'blog' ? 'ブログ' : '短文'
}
