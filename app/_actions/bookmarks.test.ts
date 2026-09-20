import { afterEach, describe, expect, it, vi } from 'vitest'
import { bookmarkPost, unbookmarkPost } from './bookmarks'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

const userId = '99999999-9999-4999-8999-999999999999'
const postId = '11111111-1111-4111-8111-111111111111'

/**
 * `.eq()` / `.is()` を積み重ねた末に `await` されるだけの単純なクエリチェーンを模す。
 * 実装側の呼び出し回数・引数は問わず、最終的に解決する値だけを固定する
 *   app/_actions/comments.test.ts と同じ形
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
    bookmarkCount?: { data: { bookmark_count: number } | null; error?: unknown }
    bookmarksInsert?: { data: { post_id: string } | null; error?: unknown }
    bookmarksDelete?: { error?: unknown }
  } = {},
) {
  const user = 'user' in options ? options.user : { id: userId }
  const postExists = options.postExists ?? { count: 1, error: null }
  const bookmarkCountResult = options.bookmarkCount ?? { data: { bookmark_count: 1 }, error: null }
  const bookmarksInsertResult = options.bookmarksInsert ?? {
    data: { post_id: postId },
    error: null,
  }
  const bookmarksDeleteResult = options.bookmarksDelete ?? { error: null }

  const postsTable = {
    select: vi.fn((columns: string) =>
      makeChain(columns === 'bookmark_count' ? bookmarkCountResult : postExists),
    ),
  }
  const bookmarksInsertChain = {
    select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue(bookmarksInsertResult) })),
  }
  const bookmarksTable = {
    insert: vi.fn(() => bookmarksInsertChain),
    delete: vi.fn(() => makeChain(bookmarksDeleteResult)),
  }

  const from = vi.fn((table: string) => (table === 'posts' ? postsTable : bookmarksTable))

  return {
    stub: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
      from,
    },
    spies: { insert: bookmarksTable.insert, delete: bookmarksTable.delete },
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('bookmarkPost', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await bookmarkPost({ postId: 'not-a-uuid' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await bookmarkPost({ postId })

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('投稿が存在しない（非公開・論理削除済み含む）なら POST_NOT_FOUND を返す', async () => {
    const { stub } = buildSupabaseStub({ postExists: { count: 0, error: null } })
    createClientMock.mockResolvedValue(stub)

    const result = await bookmarkPost({ postId })

    expect(result).toEqual({ ok: false, error: 'POST_NOT_FOUND' })
  })

  it('成功時は確定した bookmark_count を返す', async () => {
    const { stub, spies } = buildSupabaseStub({
      bookmarkCount: { data: { bookmark_count: 4 }, error: null },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await bookmarkPost({ postId })

    expect(result).toEqual({ ok: true, data: { bookmarkCount: 4 } })
    expect(spies.insert).toHaveBeenCalledWith({ user_id: userId, post_id: postId })
  })

  it('主キーの重複（既に保存済み）は成功として確定件数を返す', async () => {
    const { stub } = buildSupabaseStub({
      bookmarksInsert: { data: null, error: { code: '23505', message: 'duplicate key' } },
      bookmarkCount: { data: { bookmark_count: 2 }, error: null },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await bookmarkPost({ postId })

    expect(result).toEqual({ ok: true, data: { bookmarkCount: 2 } })
  })

  it('post_id の FK 違反は POST_NOT_FOUND を返す', async () => {
    const { stub } = buildSupabaseStub({
      bookmarksInsert: {
        data: null,
        error: {
          code: '23503',
          message: 'violates foreign key constraint "post_bookmarks_post_id_fkey"',
        },
      },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await bookmarkPost({ postId })

    expect(result).toEqual({ ok: false, error: 'POST_NOT_FOUND' })
  })

  it('user_id の FK 違反（未知の制約名）は FORBIDDEN を返す', async () => {
    const { stub } = buildSupabaseStub({
      bookmarksInsert: {
        data: null,
        error: {
          code: '23503',
          message: 'violates foreign key constraint "post_bookmarks_user_id_fkey"',
        },
      },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await bookmarkPost({ postId })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('RLS(42501) は FORBIDDEN を返す（suspended / pending_consent）', async () => {
    const { stub } = buildSupabaseStub({
      bookmarksInsert: { data: null, error: { code: '42501', message: 'permission denied' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await bookmarkPost({ postId })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('想定外のエラーコードは INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      bookmarksInsert: { data: null, error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await bookmarkPost({ postId })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})

describe('unbookmarkPost', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await unbookmarkPost({ postId: 'not-a-uuid' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await unbookmarkPost({ postId })

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('成功時（対象外で0件削除の場合を含む）は確定した bookmark_count を返す', async () => {
    const { stub, spies } = buildSupabaseStub({
      bookmarkCount: { data: { bookmark_count: 0 }, error: null },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await unbookmarkPost({ postId })

    expect(result).toEqual({ ok: true, data: { bookmarkCount: 0 } })
    expect(spies.delete).toHaveBeenCalled()
  })

  it('delete が失敗したら INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      bookmarksDelete: { error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await unbookmarkPost({ postId })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})
