import { describe, expect, it } from 'vitest'
import { DRAFT_PAYLOAD_VERSION, draftPayloadSchema, saveDraftSchema } from './drafts'

const postId = '11111111-1111-4111-8111-111111111111'
const tagId = '22222222-2222-4222-8222-222222222222'
const cafeId = '33333333-3333-4333-8333-333333333333'

const basePayload = {
  v: DRAFT_PAYLOAD_VERSION,
  post_id: postId,
  post_type: 'short',
  body_json: { type: 'doc', content: [] },
}

describe('draftPayloadSchema', () => {
  it('省略可能な項目を既定値で補完する', () => {
    const parsed = draftPayloadSchema.parse(basePayload)

    expect(parsed).toMatchObject({
      title: null,
      tag_ids: [],
      image_paths: [],
      cafe_id: null,
    })
  })

  it('post_id が無い下書きは受け付けない（再開時に予約行を特定できないため）', () => {
    const { post_id: _omitted, ...withoutPostId } = basePayload

    expect(draftPayloadSchema.safeParse(withoutPostId).success).toBe(false)
  })

  it('バージョンが一致しない下書きは弾く（呼び出し元が stale として扱う）', () => {
    const result = draftPayloadSchema.safeParse({ ...basePayload, v: DRAFT_PAYLOAD_VERSION + 1 })

    expect(result.success).toBe(false)
  })

  it('画像パスは {author_id}/{post_id}/{uuid}.webp 形式のみ許可する', () => {
    const valid = draftPayloadSchema.safeParse({
      ...basePayload,
      image_paths: [`${postId}/${postId}/abc.webp`],
    })
    const traversal = draftPayloadSchema.safeParse({
      ...basePayload,
      image_paths: ['../../etc/passwd.webp'],
    })

    expect(valid.success).toBe(true)
    expect(traversal.success).toBe(false)
  })

  it('タグ5個・画像10枚の上限を超えたら弾く', () => {
    const tooManyTags = draftPayloadSchema.safeParse({
      ...basePayload,
      tag_ids: Array.from({ length: 6 }, () => tagId),
    })
    const tooManyImages = draftPayloadSchema.safeParse({
      ...basePayload,
      image_paths: Array.from({ length: 11 }, (_, i) => `${postId}/${postId}/img${i}.webp`),
    })

    expect(tooManyTags.success).toBe(false)
    expect(tooManyImages.success).toBe(false)
  })

  it('ブログの下書きはタイトル・カフェを保持する', () => {
    const parsed = draftPayloadSchema.parse({
      ...basePayload,
      post_type: 'blog',
      title: 'ブログのタイトル',
      cafe_id: cafeId,
    })

    expect(parsed.title).toBe('ブログのタイトル')
    expect(parsed.cafe_id).toBe(cafeId)
  })
})

describe('saveDraftSchema', () => {
  it('UUID 形式の下書きキーを受け付ける', () => {
    const result = saveDraftSchema.safeParse({
      clientDraftKey: '44444444-4444-4444-8444-444444444444',
      payload: basePayload,
    })

    expect(result.success).toBe(true)
  })

  it('記号混じり・短すぎる下書きキーは弾く', () => {
    for (const clientDraftKey of ['short', 'key with space', 'key/../escape']) {
      expect(saveDraftSchema.safeParse({ clientDraftKey, payload: basePayload }).success).toBe(
        false,
      )
    }
  })
})
