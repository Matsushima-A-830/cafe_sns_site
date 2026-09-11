import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST_BODY_MAX_PLAIN_CHARS } from '@/lib/validators/posts'
import { createPost, reservePost } from './posts'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

const userId = '99999999-9999-4999-8999-999999999999'
const postId = '11111111-1111-4111-8111-111111111111'
const otherPostId = '77777777-7777-4777-8777-777777777777'
const cafeId = '22222222-2222-4222-8222-222222222222'
const tagId = '33333333-3333-4333-8333-333333333333'
const textDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文' }] }],
}
const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] }
const imagePathA = `${userId}/${postId}/a.webp`
const imagePathB = `${userId}/${postId}/b.webp`

type RpcResult = { error?: unknown }

function buildSupabaseStub(options: {
  user?: { id: string } | null
  postInsert?: { error?: unknown }
  rpc?: RpcResult
}) {
  const postsInsert = vi.fn().mockResolvedValue(options.postInsert ?? { error: null })
  const rpc = vi.fn().mockResolvedValue(options.rpc ?? { error: null })

  const tables: Record<string, unknown> = {
    posts: { insert: postsInsert },
  }

  const from = vi.fn((table: string) => tables[table])

  return {
    stub: {
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: 'user' in options ? options.user : { id: userId } } }),
      },
      from,
      rpc,
    },
    spies: { postsInsert, rpc },
  }
}

beforeEach(() => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    postId as unknown as ReturnType<typeof crypto.randomUUID>,
  )
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('reservePost', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await reservePost({ postType: 'video' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await reservePost({ postType: 'short' })

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('status=hidden・空本文の posts 行を予約作成する', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await reservePost({ postType: 'blog' })

    expect(result).toEqual({ ok: true, data: { postId } })
    expect(spies.postsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: postId,
        author_id: userId,
        post_type: 'blog',
        is_official: false,
        status: 'hidden',
      }),
    )
  })

  it('insert が RLS(42501)で弾かれたら FORBIDDEN を返す', async () => {
    const { stub } = buildSupabaseStub({
      postInsert: { error: { code: '42501', message: 'permission denied' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await reservePost({ postType: 'short' })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('insert の想定外エラーは INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      postInsert: { error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await reservePost({ postType: 'short' })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'boom' })
  })
})

describe('createPost', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await createPost({ postType: 'video', postId, bodyJson: textDoc })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す（本文の内容チェックより前に判定する）', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({ postType: 'short', postId, bodyJson: textDoc })

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('本文が空文字相当なら POST_BODY_EMPTY を返す', async () => {
    const { stub } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({ postType: 'short', postId, bodyJson: emptyDoc })

    expect(result).toEqual({ ok: false, error: 'POST_BODY_EMPTY' })
  })

  it('ブログ投稿は画像があっても本文空なら POST_BODY_EMPTY を返す', async () => {
    const { stub } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'blog',
      postId,
      title: 'タイトル',
      bodyJson: emptyDoc,
      imagePaths: [imagePathA],
    })

    expect(result).toEqual({ ok: false, error: 'POST_BODY_EMPTY' })
  })

  it('短文投稿は画像が1枚以上あれば本文空でも作成できる', async () => {
    const { stub } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      postId,
      bodyJson: emptyDoc,
      imagePaths: [imagePathA],
    })

    expect(result).toEqual({ ok: true, data: { postId } })
  })

  it('本文が上限文字数を超えると POST_BODY_TOO_LONG を返す', async () => {
    const { stub } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)
    const longDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'あ'.repeat(POST_BODY_MAX_PLAIN_CHARS + 1) }],
        },
      ],
    }

    const result = await createPost({ postType: 'short', postId, bodyJson: longDoc })

    expect(result).toEqual({ ok: false, error: 'POST_BODY_TOO_LONG' })
  })

  it('循環参照など stringify できない本文は POST_BODY_TOO_LONG を返し例外を投げない', async () => {
    const { stub } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)
    const circular: Record<string, unknown> = {
      type: 'doc',
      content: [{ type: 'text', text: '本文' }],
    }
    circular.self = circular

    await expect(createPost({ postType: 'short', postId, bodyJson: circular })).resolves.toEqual({
      ok: false,
      error: 'POST_BODY_TOO_LONG',
    })
  })

  it('別の postId のフォルダを指す imagePaths は FORBIDDEN を返し、RPC を呼ばない', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      postId,
      bodyJson: textDoc,
      imagePaths: [`${userId}/${otherPostId}/a.webp`],
    })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(spies.rpc).not.toHaveBeenCalled()
  })

  it('短文投稿を作成できる（画像・タグ・カフェ無し）。finalize_post を正しい引数で呼ぶ', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({ postType: 'short', postId, bodyJson: textDoc })

    expect(result).toEqual({ ok: true, data: { postId } })
    expect(spies.rpc).toHaveBeenCalledWith('finalize_post', {
      p_post_id: postId,
      p_post_type: 'short',
      p_title: null,
      p_body_json: textDoc,
      p_visibility: 'public',
      p_cafe_id: null,
      p_image_paths: [],
      p_tag_ids: [],
    })
  })

  it('ブログ投稿は title・postType を finalize_post に渡す', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'blog',
      postId,
      title: 'タイトル',
      bodyJson: textDoc,
    })

    expect(result).toEqual({ ok: true, data: { postId } })
    expect(spies.rpc).toHaveBeenCalledWith(
      'finalize_post',
      expect.objectContaining({ p_post_type: 'blog', p_title: 'タイトル' }),
    )
  })

  it('カフェ・タグ・画像を finalize_post に渡す', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      postId,
      bodyJson: textDoc,
      cafeId,
      tagIds: [tagId],
      imagePaths: [imagePathA, imagePathB],
    })

    expect(result).toEqual({ ok: true, data: { postId } })
    expect(spies.rpc).toHaveBeenCalledWith(
      'finalize_post',
      expect.objectContaining({
        p_cafe_id: cafeId,
        p_tag_ids: [tagId],
        p_image_paths: [imagePathA, imagePathB],
      }),
    )
  })

  it('finalize_post が FORBIDDEN(P0001) を raise したら FORBIDDEN を返す（他人の postId・二重送信・postType食い違い）', async () => {
    const { stub } = buildSupabaseStub({
      rpc: { error: { code: 'P0001', message: 'FORBIDDEN' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      postId,
      bodyJson: textDoc,
      imagePaths: [imagePathA],
    })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('cafe_id の外部キー違反は CAFE_NOT_FOUND を返し、Storage の画像は消さない（再送で使い直せるようにする）', async () => {
    const { stub } = buildSupabaseStub({
      rpc: {
        error: {
          code: '23503',
          message:
            'insert or update on table "posts" violates foreign key constraint "posts_cafe_id_fkey"',
        },
      },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      postId,
      bodyJson: textDoc,
      cafeId,
      imagePaths: [imagePathA],
    })

    expect(result).toEqual({ ok: false, error: 'CAFE_NOT_FOUND' })
  })

  it('画像上限超過(P0001)は POST_IMAGES_LIMIT_EXCEEDED を返す', async () => {
    const { stub } = buildSupabaseStub({
      rpc: { error: { code: 'P0001', message: 'POST_IMAGES_LIMIT_EXCEEDED' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      postId,
      bodyJson: textDoc,
      imagePaths: [imagePathA],
    })

    expect(result).toEqual({ ok: false, error: 'POST_IMAGES_LIMIT_EXCEEDED' })
  })

  it('タグ上限超過(P0001)は POST_TAGS_LIMIT_EXCEEDED を返す', async () => {
    const { stub } = buildSupabaseStub({
      rpc: { error: { code: 'P0001', message: 'POST_TAGS_LIMIT_EXCEEDED' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      postId,
      bodyJson: textDoc,
      tagIds: [tagId],
    })

    expect(result).toEqual({ ok: false, error: 'POST_TAGS_LIMIT_EXCEEDED' })
  })

  it('RLS(42501)で弾かれたら FORBIDDEN を返す（suspended ユーザー等）', async () => {
    const { stub } = buildSupabaseStub({
      rpc: { error: { code: '42501', message: 'permission denied' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      postId,
      bodyJson: textDoc,
      imagePaths: [imagePathA],
    })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('一意制約違反(23505)は CONFLICT を返す（行ロックにより通常到達しない想定外系の保険）', async () => {
    const { stub } = buildSupabaseStub({
      rpc: {
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "post_tags_pkey"',
        },
      },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      postId,
      bodyJson: textDoc,
      tagIds: [tagId],
    })

    expect(result).toEqual({ ok: false, error: 'CONFLICT' })
  })

  it('finalize_post の想定外エラーは INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      rpc: { error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({ postType: 'short', postId, bodyJson: textDoc })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'boom' })
  })

  it('重複した tagIds は去重してから finalize_post に渡す', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      postId,
      bodyJson: textDoc,
      tagIds: [tagId, tagId],
    })

    expect(result).toEqual({ ok: true, data: { postId } })
    expect(spies.rpc).toHaveBeenCalledWith(
      'finalize_post',
      expect.objectContaining({ p_tag_ids: [tagId] }),
    )
  })

  it('重複した imagePaths は去重してから finalize_post に渡す', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      postId,
      bodyJson: textDoc,
      imagePaths: [imagePathA, imagePathA],
    })

    expect(result).toEqual({ ok: true, data: { postId } })
    expect(spies.rpc).toHaveBeenCalledWith(
      'finalize_post',
      expect.objectContaining({ p_image_paths: [imagePathA] }),
    )
  })
})
