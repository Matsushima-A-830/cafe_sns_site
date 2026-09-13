import { EMPTY_TIPTAP_DOC } from '@/lib/validators/posts'

/**
 * 短文投稿（S_POST_SHORT）のコメント欄は素の textarea。保存形式は投稿全体で
 * Tiptap JSON に統一されているため、ここで相互変換する。
 * ブログ（S_POST_BLOG）は Tiptap 自身が JSON を吐くのでこの変換は通らない
 *   docs/design/wireframes/composer.md
 */

type TiptapDoc = Record<string, unknown>

/** 空行（連続改行）は段落の区切り。各行はそのまま1段落にする */
export function textToTiptapDoc(text: string): TiptapDoc {
  const paragraphs = text.split('\n')
  if (text.trim().length === 0) return { ...EMPTY_TIPTAP_DOC }

  return {
    type: 'doc',
    content: paragraphs.map((line) =>
      // 空行は content を持たない段落。content: [] だと Tiptap がノードを不正と見なす
      line.length === 0
        ? { type: 'paragraph' }
        : { type: 'paragraph', content: [{ type: 'text', text: line }] },
    ),
  }
}

/** 下書き再開時に textarea へ戻す。段落を改行で連結するだけで、装飾は落ちる */
export function tiptapDocToText(doc: unknown): string {
  if (doc === null || typeof doc !== 'object') return ''
  const content = (doc as { content?: unknown }).content
  if (!Array.isArray(content)) return ''

  return content
    .map((node) => {
      const inline = (node as { content?: unknown }).content
      if (!Array.isArray(inline)) return ''
      return inline
        .map((leaf) => {
          const text = (leaf as { text?: unknown }).text
          return typeof text === 'string' ? text : ''
        })
        .join('')
    })
    .join('\n')
}
