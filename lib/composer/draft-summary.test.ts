import { describe, expect, it } from 'vitest'
import { draftPostTypeLabel, draftPreviewText, draftResumeHref } from '@/lib/composer/draft-summary'
import { DRAFT_PAYLOAD_VERSION, type DraftPayload } from '@/lib/validators/drafts'

function payload(overrides: Partial<DraftPayload> = {}): DraftPayload {
  return {
    v: DRAFT_PAYLOAD_VERSION,
    post_id: '11111111-1111-4111-8111-111111111111',
    post_type: 'short',
    title: null,
    body_json: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文の冒頭' }] }],
    },
    tag_ids: [],
    image_paths: [],
    cafe_id: null,
    visibility: 'public',
    ...overrides,
  }
}

const draft = (overrides: Partial<DraftPayload> = {}, key = 'draft-aaaaaaaa') => ({
  clientDraftKey: key,
  payload: payload(overrides),
})

describe('draftPreviewText', () => {
  it('タイトルがあればタイトルを使う', () => {
    expect(draftPreviewText(draft({ title: 'タイトル' }))).toBe('タイトル')
  })

  it('タイトルが空文字・空白だけなら本文にフォールバックする', () => {
    expect(draftPreviewText(draft({ title: '   ' }))).toBe('本文の冒頭')
  })

  it('タイトルも本文も無ければ代替テキストを返す', () => {
    expect(draftPreviewText(draft({ body_json: { type: 'doc', content: [] } }))).toBe(
      '（本文なし）',
    )
  })

  it('上限を超えたら省略記号を付ける', () => {
    expect(draftPreviewText(draft({ title: 'あ'.repeat(50) }), 10)).toBe(`${'あ'.repeat(10)}…`)
  })

  // slice はコード単位で切るので、絵文字の境界に当たると壊れた文字が残る
  it('絵文字を途中で割らない', () => {
    const preview = draftPreviewText(draft({ title: '☕🧋🍰🍮🍪' }), 3)

    expect(preview).toBe('☕🧋🍰…')
    expect(preview).not.toContain('�')
  })
})

describe('draftResumeHref', () => {
  // post_type とルートの対応がずれると下書きが復元されないまま別のフォームが開く
  it('形式ごとに対応するフォームへ送る', () => {
    expect(draftResumeHref(draft({ post_type: 'blog' }))).toBe('/new/blog?draft=draft-aaaaaaaa')
    expect(draftResumeHref(draft({ post_type: 'short' }))).toBe('/new/short?draft=draft-aaaaaaaa')
  })

  it('キーは URL エンコードする', () => {
    expect(draftResumeHref(draft({}, 'draft-a+b'))).toBe('/new/short?draft=draft-a%2Bb')
  })
})

describe('draftPostTypeLabel', () => {
  it('日本語UIの表記に変換する', () => {
    expect(draftPostTypeLabel(draft({ post_type: 'blog' }))).toBe('ブログ')
    expect(draftPostTypeLabel(draft({ post_type: 'short' }))).toBe('短文')
  })
})
