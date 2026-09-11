import { describe, expect, it } from 'vitest'
import { createPostSchema, extractPlainText, getBodyJsonByteSize } from './posts'

const validPostId = '00000000-0000-4000-8000-000000000000'
const validCafeId = '11111111-1111-4111-8111-111111111111'
const validTagId = '22222222-2222-4222-8222-222222222222'
const validImagePath = 'author-uuid/post-uuid/image-uuid.webp'
const textDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'こんにちは' }] }],
}

describe('createPostSchema', () => {
  it('短文投稿の最小入力を通す', () => {
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
    })
    expect(result.success).toBe(true)
  })

  it('短文投稿は title が無くても通る', () => {
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
    })
    expect(result.success).toBe(true)
    if (result.success) expect('title' in result.data).toBe(false)
  })

  it('ブログ投稿は title が必須', () => {
    const result = createPostSchema.safeParse({
      postType: 'blog',
      postId: validPostId,
      bodyJson: textDoc,
    })
    expect(result.success).toBe(false)
  })

  it('ブログ投稿は title があれば通る', () => {
    const result = createPostSchema.safeParse({
      postType: 'blog',
      postId: validPostId,
      title: 'タイトル',
      bodyJson: textDoc,
    })
    expect(result.success).toBe(true)
  })

  it('未知の postType を弾く', () => {
    const result = createPostSchema.safeParse({ postType: 'video', bodyJson: textDoc })
    expect(result.success).toBe(false)
  })

  it('cafeId / tagIds / imagePaths / visibility を省略するとデフォルト値が入る', () => {
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cafeId).toBeUndefined()
      expect(result.data.tagIds).toEqual([])
      expect(result.data.imagePaths).toEqual([])
      expect(result.data.visibility).toBe('public')
    }
  })

  it('uuid でない cafeId を弾く', () => {
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
      cafeId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('タグは5個まで', () => {
    const tagIds = Array.from({ length: 6 }, (_, i) => `${validTagId.slice(0, -1)}${i}`)
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
      tagIds,
    })
    expect(result.success).toBe(false)
  })

  it('タグ5個ちょうどは通る', () => {
    const tagIds = Array.from({ length: 5 }, (_, i) => `${validTagId.slice(0, -1)}${i}`)
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
      tagIds,
    })
    expect(result.success).toBe(true)
  })

  it('重複した tagIds は去重される', () => {
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
      tagIds: [validTagId, validTagId],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.tagIds).toEqual([validTagId])
  })

  it('画像は10枚まで', () => {
    const imagePaths = Array.from({ length: 11 }, (_, i) => `author/post/${i}.webp`)
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
      imagePaths,
    })
    expect(result.success).toBe(false)
  })

  it('画像パスの形式が正しくないものを弾く', () => {
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
      imagePaths: ['not-a-valid-path.webp'],
    })
    expect(result.success).toBe(false)
  })

  it('正しい形式の画像パスを通す', () => {
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
      imagePaths: [validImagePath],
    })
    expect(result.success).toBe(true)
  })

  it('パストラバーサル（..）を含む画像パスを弾く', () => {
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
      imagePaths: ['../../etc/passwd.webp'],
    })
    expect(result.success).toBe(false)
  })

  it('スラッシュを含む余分なセグメントを弾く', () => {
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
      imagePaths: ['author/post/extra/image.webp'],
    })
    expect(result.success).toBe(false)
  })

  it('重複した imagePaths は去重される', () => {
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
      imagePaths: [validImagePath, validImagePath],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.imagePaths).toEqual([validImagePath])
  })

  it('去重後に10枚以内になるなら通る（去重は上限チェックより先に行う）', () => {
    const imagePaths = Array.from({ length: 11 }, () => validImagePath)
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
      imagePaths,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.imagePaths).toEqual([validImagePath])
  })

  it('去重後もタグ5個ちょうどは通る', () => {
    const tagIds = Array.from({ length: 6 }, () => validTagId)
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
      tagIds,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.tagIds).toEqual([validTagId])
  })

  it('visibility が不正な値だと弾く', () => {
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
      visibility: 'private',
    })
    expect(result.success).toBe(false)
  })

  it('cafeId が正しい uuid なら通る', () => {
    const result = createPostSchema.safeParse({
      postType: 'short',
      postId: validPostId,
      bodyJson: textDoc,
      cafeId: validCafeId,
    })
    expect(result.success).toBe(true)
  })
})

describe('extractPlainText', () => {
  it('テキストリーフを空白区切りで連結する', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'こんにちは' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '世界' }] },
      ],
    }
    expect(extractPlainText(doc)).toBe('こんにちは 世界')
  })

  it('テキストノードが無い場合は空文字を返す', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph' }] }
    expect(extractPlainText(doc)).toBe('')
  })

  it('画像ノードのみの場合も空文字を返す', () => {
    const doc = { type: 'doc', content: [{ type: 'image', attrs: { src: 'x.webp' } }] }
    expect(extractPlainText(doc)).toBe('')
  })

  it('null や配列以外の入力でも例外を投げない', () => {
    expect(extractPlainText(null)).toBe('')
    expect(extractPlainText('文字列')).toBe('')
    expect(extractPlainText(123)).toBe('')
  })

  it('content 以外のキー配下のテキストリーフも拾う（SQL の $.** と同じ全階層探索）', () => {
    const doc = {
      type: 'doc',
      // 実際の Tiptap には無い構造だが、深さを問わず辿ることを確認する
      wrapper: { nested: [{ type: 'text', text: '深い場所' }] },
    }
    expect(extractPlainText(doc)).toBe('深い場所')
  })

  it('異常に深いネストでもスタックオーバーフローせず打ち切る', () => {
    let deep: Record<string, unknown> = { type: 'text', text: '奥底' }
    for (let i = 0; i < 100_000; i++) {
      deep = { wrapper: deep }
    }
    expect(() => extractPlainText(deep)).not.toThrow()
    expect(extractPlainText(deep)).toBe('')
  })
})

describe('getBodyJsonByteSize', () => {
  it('通常のJSONはUTF-8バイト数を返す', () => {
    const size = getBodyJsonByteSize({ type: 'doc', content: [{ type: 'text', text: 'あ' }] })
    expect(size).toBeGreaterThan(0)
  })

  it('循環参照など stringify できない入力は null を返す（例外を投げない）', () => {
    const circular: Record<string, unknown> = { type: 'doc' }
    circular.self = circular

    expect(() => getBodyJsonByteSize(circular)).not.toThrow()
    expect(getBodyJsonByteSize(circular)).toBeNull()
  })
})
