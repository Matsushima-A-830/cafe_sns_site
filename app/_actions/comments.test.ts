import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMMENT_BODY_MAX_CHARS } from '@/lib/validators/comments'
import { createComment, deleteComment } from './comments'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

const userId = '99999999-9999-4999-8999-999999999999'
const postId = '11111111-1111-4111-8111-111111111111'
const commentId = '22222222-2222-4222-8222-222222222222'
const parentId = '33333333-3333-4333-8333-333333333333'

/**
 * `.eq()` / `.is()` を積み重ねた末に `await` されるだけの単純なクエリチェーンを模す。
 * 実装側の呼び出し回数・引数は問わず、最終的に解決する値だけを固定する
 */
function makeChain(terminalResult: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(terminalResult)
  // supabase-js のクエリビルダは thenable（await するだけで実行される）。
  // biome の noThenProperty を避けるため定義済みプロパティとして生やす
  Object.defineProperty(chain, 'then', {
    value: (resolve: (value: unknown) => void, reject?: (error: unknown) => void) =>
      Promise.resolve(terminalResult).then(resolve, reject),
  })
  return chain
}

function buildSupabaseStub(
  options: {
    user?: { id: string } | null
    postExists?: { count: number | null; error?: unknown }
    commentCount?: { data: { comment_count: number } | null; error?: unknown }
    commentsInsert?: { data: { id: string } | null; error?: unknown }
    commentsUpdate?: { error?: unknown }
  } = {},
) {
  const user = 'user' in options ? options.user : { id: userId }
  const postExists = options.postExists ?? { count: 1, error: null }
  const commentCountResult = options.commentCount ?? { data: { comment_count: 1 }, error: null }
  const commentsInsertResult = options.commentsInsert ?? { data: { id: commentId }, error: null }
  const commentsUpdateResult = options.commentsUpdate ?? { error: null }

  const postsTable = {
    select: vi.fn((columns: string) =>
      makeChain(columns === 'comment_count' ? commentCountResult : postExists),
    ),
  }
  const commentsInsertChain = {
    select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue(commentsInsertResult) })),
  }
  const commentsTable = {
    insert: vi.fn(() => commentsInsertChain),
    update: vi.fn(() => makeChain(commentsUpdateResult)),
  }

  const from = vi.fn((table: string) => (table === 'posts' ? postsTable : commentsTable))

  return {
    stub: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
      from,
    },
    spies: { insert: commentsTable.insert, update: commentsTable.update },
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('createComment', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await createComment({ postId: 'not-a-uuid', body: 'こんにちは' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await createComment({ postId, body: 'こんにちは' })

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('空白のみの本文は POST_BODY_EMPTY を返す', async () => {
    const { stub } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    const result = await createComment({ postId, body: '   ' })

    expect(result).toEqual({ ok: false, error: 'POST_BODY_EMPTY' })
  })

  it('上限文字数を超える本文は POST_BODY_TOO_LONG を返す', async () => {
    const { stub } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    const result = await createComment({ postId, body: 'あ'.repeat(COMMENT_BODY_MAX_CHARS + 1) })

    expect(result).toEqual({ ok: false, error: 'POST_BODY_TOO_LONG' })
  })

  it('投稿が存在しない（非公開・論理削除済み含む）なら POST_NOT_FOUND を返す', async () => {
    const { stub } = buildSupabaseStub({ postExists: { count: 0, error: null } })
    createClientMock.mockResolvedValue(stub)

    const result = await createComment({ postId, body: 'こんにちは' })

    expect(result).toEqual({ ok: false, error: 'POST_NOT_FOUND' })
  })

  it('成功時は commentId と確定した comment_count を返す', async () => {
    const { stub, spies } = buildSupabaseStub({
      commentCount: { data: { comment_count: 3 }, error: null },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createComment({ postId, body: 'こんにちは', parentId })

    expect(result).toEqual({ ok: true, data: { commentId, commentCount: 3 } })
    expect(spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        post_id: postId,
        author_id: userId,
        parent_id: parentId,
        body: 'こんにちは',
        is_official: false,
      }),
    )
  })

  it('post_id の FK 違反は POST_NOT_FOUND を返す', async () => {
    const { stub } = buildSupabaseStub({
      commentsInsert: {
        data: null,
        error: {
          code: '23503',
          message: 'violates foreign key constraint "comments_post_id_fkey"',
        },
      },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createComment({ postId, body: 'こんにちは' })

    expect(result).toEqual({ ok: false, error: 'POST_NOT_FOUND' })
  })

  it('parent_id の FK 違反は COMMENT_NOT_FOUND を返す', async () => {
    const { stub } = buildSupabaseStub({
      commentsInsert: {
        data: null,
        error: {
          code: '23503',
          message: 'violates foreign key constraint "comments_parent_id_fkey"',
        },
      },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createComment({ postId, body: 'こんにちは', parentId })

    expect(result).toEqual({ ok: false, error: 'COMMENT_NOT_FOUND' })
  })

  it('author_id の FK 違反（未知の制約名）は FORBIDDEN を返す', async () => {
    const { stub } = buildSupabaseStub({
      commentsInsert: {
        data: null,
        error: {
          code: '23503',
          message: 'violates foreign key constraint "comments_author_id_fkey"',
        },
      },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createComment({ postId, body: 'こんにちは' })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('RLS(42501) は FORBIDDEN を返す（suspended や is_official のなりすまし）', async () => {
    const { stub } = buildSupabaseStub({
      commentsInsert: { data: null, error: { code: '42501', message: 'permission denied' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createComment({ postId, body: 'こんにちは' })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('トリガーの raise exception (P0001) は FORBIDDEN を返す', async () => {
    const { stub } = buildSupabaseStub({
      commentsInsert: { data: null, error: { code: 'P0001', message: 'FORBIDDEN' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createComment({ postId, body: 'こんにちは', parentId })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('想定外のエラーコードは INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      commentsInsert: { data: null, error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createComment({ postId, body: 'こんにちは' })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})

describe('deleteComment', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await deleteComment({ commentId: 'not-a-uuid', postId })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await deleteComment({ commentId, postId })

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('成功時（対象外で0件更新の場合を含む）は確定した comment_count を返す', async () => {
    const { stub, spies } = buildSupabaseStub({
      commentCount: { data: { comment_count: 2 }, error: null },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await deleteComment({ commentId, postId })

    expect(result).toEqual({ ok: true, data: { commentCount: 2 } })
    expect(spies.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    )
  })

  it('update が失敗したら INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      commentsUpdate: { error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await deleteComment({ commentId, postId })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})
