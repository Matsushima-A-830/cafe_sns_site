import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST_BODY_MAX_PLAIN_CHARS } from '@/lib/validators/posts'
import { createPost } from './posts'

const { createClientMock, deletePostImagesMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  deletePostImagesMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/storage/post-images', async (importOriginal) => ({
  ...(await importOriginal()),
  deletePostImages: deletePostImagesMock,
}))

const userId = '99999999-9999-4999-8999-999999999999'
const otherUserId = '88888888-8888-4888-8888-888888888888'
const postId = '11111111-1111-4111-8111-111111111111'
const cafeId = '22222222-2222-4222-8222-222222222222'
const tagId = '33333333-3333-4333-8333-333333333333'
const textDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文' }] }],
}
const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] }
const imagePathA = `${userId}/post/a.webp`
const imagePathB = `${userId}/post/b.webp`

type Insertable = { error?: unknown }
type Updatable = { error?: unknown }
type ExistingImagesResult = { count?: number | null; error?: unknown }

function buildSupabaseStub(options: {
  user?: { id: string } | null
  postInsert?: Insertable
  existingImages?: ExistingImagesResult
  imagesInsert?: Insertable
  tagsInsert?: Insertable
  publishUpdate?: Updatable
}) {
  const postsInsert = vi.fn().mockResolvedValue(options.postInsert ?? { error: null })
  const postsDeleteEq = vi.fn().mockResolvedValue({ error: null })
  const postsDelete = vi.fn().mockReturnValue({ eq: postsDeleteEq })
  const postsUpdateEq = vi.fn().mockResolvedValue(options.publishUpdate ?? { error: null })
  const postsUpdate = vi.fn().mockReturnValue({ eq: postsUpdateEq })

  const postImagesIn = vi
    .fn()
    .mockResolvedValue(options.existingImages ?? { count: 0, error: null })
  const postImagesSelect = vi.fn().mockReturnValue({ in: postImagesIn })
  const postImagesInsert = vi.fn().mockResolvedValue(options.imagesInsert ?? { error: null })
  const postTagsInsert = vi.fn().mockResolvedValue(options.tagsInsert ?? { error: null })

  const tables: Record<string, unknown> = {
    posts: { insert: postsInsert, delete: postsDelete, update: postsUpdate },
    post_images: { select: postImagesSelect, insert: postImagesInsert },
    post_tags: { insert: postTagsInsert },
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
    },
    spies: {
      postsInsert,
      postsDelete,
      postsDeleteEq,
      postsUpdate,
      postsUpdateEq,
      postImagesSelect,
      postImagesIn,
      postImagesInsert,
      postTagsInsert,
    },
  }
}

beforeEach(() => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    postId as unknown as ReturnType<typeof crypto.randomUUID>,
  )
  deletePostImagesMock.mockResolvedValue({ ok: true, data: null })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('createPost', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await createPost({ postType: 'video', bodyJson: textDoc })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す（本文の内容チェックより前に判定する）', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({ postType: 'short', bodyJson: textDoc })

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('本文が空文字相当なら POST_BODY_EMPTY を返す', async () => {
    const { stub } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({ postType: 'short', bodyJson: emptyDoc })

    expect(result).toEqual({ ok: false, error: 'POST_BODY_EMPTY' })
  })

  it('ブログ投稿は画像があっても本文空なら POST_BODY_EMPTY を返す', async () => {
    const { stub } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'blog',
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

    const result = await createPost({ postType: 'short', bodyJson: longDoc })

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

    await expect(createPost({ postType: 'short', bodyJson: circular })).resolves.toEqual({
      ok: false,
      error: 'POST_BODY_TOO_LONG',
    })
  })

  it('他人の author_id フォルダを指す imagePaths は FORBIDDEN を返し、posts へ書き込まない', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      bodyJson: textDoc,
      imagePaths: [`${otherUserId}/post/a.webp`],
    })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(spies.postsInsert).not.toHaveBeenCalled()
  })

  it('既に post_images に登録済みのパスを渡すと CONFLICT を返し、posts へ書き込まない', async () => {
    const { stub, spies } = buildSupabaseStub({ existingImages: { count: 1, error: null } })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      bodyJson: textDoc,
      imagePaths: [imagePathA],
    })

    expect(result).toEqual({ ok: false, error: 'CONFLICT' })
    expect(spies.postsInsert).not.toHaveBeenCalled()
  })

  it('既存画像チェック自体が失敗したら INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      existingImages: { count: null, error: { message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      bodyJson: textDoc,
      imagePaths: [imagePathA],
    })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'boom' })
  })

  it('短文投稿を作成できる（画像・タグ・カフェ無し）。id はクライアント側で生成し .select() は使わない', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({ postType: 'short', bodyJson: textDoc })

    expect(result).toEqual({ ok: true, data: { postId } })
    expect(spies.postsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: postId,
        author_id: userId,
        post_type: 'short',
        title: null,
        body_json: textDoc,
        is_official: false,
        visibility: 'public',
        status: 'hidden',
      }),
    )
    expect(spies.postsUpdate).toHaveBeenCalledWith({ status: 'published' })
    expect(spies.postsUpdateEq).toHaveBeenCalledWith('id', postId)
  })

  it('ブログ投稿は title を保存する', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({ postType: 'blog', title: 'タイトル', bodyJson: textDoc })

    expect(result).toEqual({ ok: true, data: { postId } })
    expect(spies.postsInsert).toHaveBeenCalledWith(expect.objectContaining({ title: 'タイトル' }))
  })

  it('カフェ・タグ・画像を伴う投稿を作成できる', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      bodyJson: textDoc,
      cafeId,
      tagIds: [tagId],
      imagePaths: [imagePathA, imagePathB],
    })

    expect(result).toEqual({ ok: true, data: { postId } })
    expect(spies.postImagesInsert).toHaveBeenCalledWith([
      { post_id: postId, storage_path: imagePathA, display_order: 0 },
      { post_id: postId, storage_path: imagePathB, display_order: 1 },
    ])
    expect(spies.postTagsInsert).toHaveBeenCalledWith([{ post_id: postId, tag_id: tagId }])
  })

  it('cafe_id の外部キー違反は CAFE_NOT_FOUND を返す', async () => {
    const { stub } = buildSupabaseStub({
      postInsert: {
        error: {
          code: '23503',
          message:
            'insert or update on table "posts" violates foreign key constraint "posts_cafe_id_fkey"',
        },
      },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({ postType: 'short', bodyJson: textDoc, cafeId })

    expect(result).toEqual({ ok: false, error: 'CAFE_NOT_FOUND' })
  })

  it('author_id の外部キー違反は CAFE_NOT_FOUND にせず INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      postInsert: {
        error: {
          code: '23503',
          message:
            'insert or update on table "posts" violates foreign key constraint "posts_author_id_fkey"',
        },
      },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({ postType: 'short', bodyJson: textDoc })

    expect(result).toEqual({
      ok: false,
      error: 'INTERNAL_ERROR',
      details: expect.stringContaining('posts_author_id_fkey'),
    })
  })

  it('posts insert が RLS(42501)で弾かれたら FORBIDDEN を返す', async () => {
    const { stub } = buildSupabaseStub({
      postInsert: { error: { code: '42501', message: 'permission denied' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({ postType: 'short', bodyJson: textDoc })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('posts insert の想定外エラーは INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      postInsert: { error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({ postType: 'short', bodyJson: textDoc })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'boom' })
  })

  it('画像上限超過は POST_IMAGES_LIMIT_EXCEEDED を返し、post行と画像をロールバックする', async () => {
    const { stub, spies } = buildSupabaseStub({
      imagesInsert: { error: { code: 'P0001', message: 'POST_IMAGES_LIMIT_EXCEEDED' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      bodyJson: textDoc,
      imagePaths: [imagePathA],
    })

    expect(result).toEqual({ ok: false, error: 'POST_IMAGES_LIMIT_EXCEEDED' })
    expect(deletePostImagesMock).toHaveBeenCalledWith(stub, [imagePathA])
    expect(spies.postsDelete).toHaveBeenCalled()
    expect(spies.postsDeleteEq).toHaveBeenCalledWith('id', postId)
  })

  it('タグ上限超過は POST_TAGS_LIMIT_EXCEEDED を返し、post行をロールバックする', async () => {
    const { stub, spies } = buildSupabaseStub({
      tagsInsert: { error: { code: 'P0001', message: 'POST_TAGS_LIMIT_EXCEEDED' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      bodyJson: textDoc,
      tagIds: [tagId],
    })

    expect(result).toEqual({ ok: false, error: 'POST_TAGS_LIMIT_EXCEEDED' })
    expect(spies.postsDelete).toHaveBeenCalled()
    expect(spies.postsDeleteEq).toHaveBeenCalledWith('id', postId)
  })

  it('post_images insert が RLS(42501)で弾かれたら FORBIDDEN を返しロールバックする', async () => {
    const { stub, spies } = buildSupabaseStub({
      imagesInsert: { error: { code: '42501', message: 'permission denied' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      bodyJson: textDoc,
      imagePaths: [imagePathA],
    })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(spies.postsDelete).toHaveBeenCalled()
  })

  it('post_images insert の想定外エラーは INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      imagesInsert: { error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      bodyJson: textDoc,
      imagePaths: [imagePathA],
    })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'boom' })
  })

  it('ロールバックの画像削除自体が失敗してもログに残すだけで処理は続行する', async () => {
    deletePostImagesMock.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { stub } = buildSupabaseStub({
      imagesInsert: { error: { code: 'P0001', message: 'POST_IMAGES_LIMIT_EXCEEDED' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      bodyJson: textDoc,
      imagePaths: [imagePathA],
    })

    expect(result).toEqual({ ok: false, error: 'POST_IMAGES_LIMIT_EXCEEDED' })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('画像削除に失敗'),
      postId,
      expect.anything(),
    )
    consoleErrorSpy.mockRestore()
  })

  it('公開更新(status=published)が失敗したら post 行をロールバックする', async () => {
    const { stub, spies } = buildSupabaseStub({
      publishUpdate: { error: { code: 'XXXXX', message: 'publish boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({ postType: 'short', bodyJson: textDoc })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'publish boom' })
    expect(spies.postsDelete).toHaveBeenCalled()
    expect(spies.postsDeleteEq).toHaveBeenCalledWith('id', postId)
  })

  it('重複した tagIds は去重してから post_tags へ書き込む', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      bodyJson: textDoc,
      tagIds: [tagId, tagId],
    })

    expect(result).toEqual({ ok: true, data: { postId } })
    expect(spies.postTagsInsert).toHaveBeenCalledWith([{ post_id: postId, tag_id: tagId }])
  })

  it('重複した imagePaths は去重してから post_images へ書き込む', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createPost({
      postType: 'short',
      bodyJson: textDoc,
      imagePaths: [imagePathA, imagePathA],
    })

    expect(result).toEqual({ ok: true, data: { postId } })
    expect(spies.postImagesInsert).toHaveBeenCalledWith([
      { post_id: postId, storage_path: imagePathA, display_order: 0 },
    ])
  })
})
