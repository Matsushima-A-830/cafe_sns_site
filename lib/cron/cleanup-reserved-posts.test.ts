import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportError } from '@/lib/monitoring/report-error'
import type { Database } from '@/types/database'
import { cleanupReservedPosts } from './cleanup-reserved-posts'

vi.mock('@/lib/monitoring/report-error', () => ({ reportError: vi.fn() }))

/** select().eq().is().lt().limit() の末に await されるチェーン */
function makeSelectChain(terminalResult: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'lt', 'limit']) {
    chain[method] = vi.fn(() => chain)
  }
  Object.defineProperty(chain, 'then', {
    value: (resolve: (value: unknown) => void, reject?: (error: unknown) => void) =>
      Promise.resolve(terminalResult).then(resolve, reject),
  })
  return chain
}

/** delete().in().eq().is().lt().select() の末に await されるチェーン */
function makeDeleteChain(terminalResult: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  for (const method of ['in', 'eq', 'is', 'lt']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.select = vi.fn().mockResolvedValue(terminalResult)
  return chain
}

type Options = {
  postsSelect?: { data: Array<{ id: string }> | null; error?: unknown }
  postsDelete?: { data?: Array<{ id: string; author_id: string }> | null; error?: unknown }
  /** key: `${authorId}/${postId}` */
  storageList?: Record<string, { data?: Array<{ name: string }> | null; error?: unknown }>
  storageRemove?: { error?: unknown }
}

function mockClient(options: Options = {}) {
  const selectResult = options.postsSelect ?? { data: [], error: null }
  let selectChain: Record<string, unknown> | null = null
  const selectSpy = vi.fn(() => {
    selectChain = makeSelectChain(selectResult)
    return selectChain
  })

  const deleteResult = options.postsDelete ?? { data: [], error: null }
  let deleteChain: Record<string, unknown> | null = null
  const deleteSpy = vi.fn(() => {
    deleteChain = makeDeleteChain(deleteResult)
    return deleteChain
  })
  const postsTable = { select: selectSpy, delete: deleteSpy }

  const listSpy = vi.fn((prefix: string) => {
    const result = options.storageList?.[prefix] ?? { data: [], error: null }
    return Promise.resolve(result)
  })
  const removeSpy = vi.fn().mockResolvedValue(options.storageRemove ?? { error: null })

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'posts') return postsTable
      throw new Error(`unexpected table: ${table}`)
    }),
    storage: { from: vi.fn(() => ({ list: listSpy, remove: removeSpy })) },
  }

  return {
    supabase,
    selectSpy,
    deleteSpy,
    listSpy,
    removeSpy,
    getSelectChain: () => selectChain,
    getDeleteChain: () => deleteChain,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

const authorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('cleanupReservedPosts', () => {
  it('対象が0件なら deleteもStorage列挙も呼ばない', async () => {
    const { supabase, listSpy, removeSpy, deleteSpy } = mockClient({
      postsSelect: { data: [], error: null },
    })

    const result = await cleanupReservedPosts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: true, data: { deletedPostCount: 0, deletedImageCount: 0 } })
    expect(deleteSpy).not.toHaveBeenCalled()
    expect(listSpy).not.toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it('SELECT/DELETEともに published_at IS NULL で絞り、通報対応で hidden にされた既公開投稿を対象から除外する', async () => {
    // hide_post（app/_actions/admin-reports.ts）は既公開投稿の status だけを 'hidden' に
    // するため、published_at は埋まったまま残る。この行を誤って削除しないための回帰テスト
    const postId = '00000000-0000-4000-8000-000000000000'
    const { supabase, getSelectChain, getDeleteChain } = mockClient({
      postsSelect: { data: [{ id: postId }], error: null },
      postsDelete: { data: [{ id: postId, author_id: authorId }], error: null },
      storageList: { [`${authorId}/${postId}`]: { data: [] } },
    })

    await cleanupReservedPosts(supabase as unknown as SupabaseClient<Database>)

    expect(getSelectChain()?.is).toHaveBeenCalledWith('published_at', null)
    expect(getDeleteChain()?.is).toHaveBeenCalledWith('published_at', null)
  })

  it('DELETEで確定した行についてのみ、Storageフォルダをまとめて削除する', async () => {
    const postId1 = '11111111-1111-4111-8111-111111111111'
    const postId2 = '22222222-2222-4222-8222-222222222222'
    const { supabase, removeSpy, deleteSpy, listSpy } = mockClient({
      postsSelect: { data: [{ id: postId1 }, { id: postId2 }], error: null },
      postsDelete: {
        data: [
          { id: postId1, author_id: authorId },
          { id: postId2, author_id: authorId },
        ],
        error: null,
      },
      storageList: {
        [`${authorId}/${postId1}`]: { data: [{ name: '1.webp' }, { name: '2.webp' }] },
        [`${authorId}/${postId2}`]: { data: [{ name: '3.webp' }] },
      },
    })

    const result = await cleanupReservedPosts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: true, data: { deletedPostCount: 2, deletedImageCount: 3 } })
    // DELETEがStorage列挙より先に呼ばれている（再送成功直後の画像を誤って消さないため）
    const deleteOrder = deleteSpy.mock.invocationCallOrder.at(0)
    const listOrder = listSpy.mock.invocationCallOrder.at(0)
    expect(deleteOrder).toBeDefined()
    expect(listOrder).toBeDefined()
    expect(deleteOrder as number).toBeLessThan(listOrder as number)
    expect(removeSpy).toHaveBeenCalledWith([
      `${authorId}/${postId1}/1.webp`,
      `${authorId}/${postId1}/2.webp`,
      `${authorId}/${postId2}/3.webp`,
    ])
  })

  it('画像を一度もアップロードしていない予約投稿でも posts行は削除する', async () => {
    const postId = '33333333-3333-4333-8333-333333333333'
    const { supabase, removeSpy } = mockClient({
      postsSelect: { data: [{ id: postId }], error: null },
      postsDelete: { data: [{ id: postId, author_id: authorId }], error: null },
      storageList: { [`${authorId}/${postId}`]: { data: [] } },
    })

    const result = await cleanupReservedPosts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: true, data: { deletedPostCount: 1, deletedImageCount: 0 } })
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it('SELECTとDELETEの間に再送finalizeが成功した行は、eq/lt再判定で削除されずStorageにも触れない', async () => {
    const survivedPostId = '66666666-6666-4666-8666-666666666666'
    const deletedPostId = '77777777-7777-4777-8777-777777777777'
    const { supabase, listSpy, removeSpy } = mockClient({
      postsSelect: {
        data: [{ id: survivedPostId }, { id: deletedPostId }],
        error: null,
      },
      // DELETE側の eq('status','hidden').lt('updated_at', cutoff) 再判定により、
      // 再送で published になった survivedPostId は削除行に含まれない
      postsDelete: { data: [{ id: deletedPostId, author_id: authorId }], error: null },
      storageList: { [`${authorId}/${deletedPostId}`]: { data: [] } },
    })

    const result = await cleanupReservedPosts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: true, data: { deletedPostCount: 1, deletedImageCount: 0 } })
    // survivedPostId のフォルダには一切アクセスしていない（公開直後の画像を保護）
    expect(listSpy).toHaveBeenCalledTimes(1)
    expect(listSpy).toHaveBeenCalledWith(`${authorId}/${deletedPostId}`)
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it('DELETEで0件になったら（全行が再送成功済み）Storage列挙は呼ばない', async () => {
    const postId = '99999999-9999-4999-8999-999999999999'
    const { supabase, listSpy, removeSpy } = mockClient({
      postsSelect: { data: [{ id: postId }], error: null },
      postsDelete: { data: [], error: null },
    })

    const result = await cleanupReservedPosts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: true, data: { deletedPostCount: 0, deletedImageCount: 0 } })
    expect(listSpy).not.toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it('posts取得が失敗したら INTERNAL_ERROR を返し、deleteもStorage列挙も呼ばない', async () => {
    const { supabase, deleteSpy, listSpy, removeSpy } = mockClient({
      postsSelect: { data: null, error: { message: 'boom' } },
    })

    const result = await cleanupReservedPosts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'boom' })
    expect(deleteSpy).not.toHaveBeenCalled()
    expect(listSpy).not.toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it('posts行のDELETEが失敗したら INTERNAL_ERROR を返し、Storageには触れない', async () => {
    const postId = '88888888-8888-4888-8888-888888888888'
    const { supabase, listSpy } = mockClient({
      postsSelect: { data: [{ id: postId }], error: null },
      postsDelete: { error: { message: 'delete failed' } },
    })

    const result = await cleanupReservedPosts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'delete failed' })
    expect(listSpy).not.toHaveBeenCalled()
  })

  it('Storageフォルダの列挙が失敗したら INTERNAL_ERROR を返す（posts行は既に削除済み）', async () => {
    const postId = '44444444-4444-4444-8444-444444444444'
    const { supabase } = mockClient({
      postsSelect: { data: [{ id: postId }], error: null },
      postsDelete: { data: [{ id: postId, author_id: authorId }], error: null },
      storageList: { [`${authorId}/${postId}`]: { data: null, error: { message: 'list failed' } } },
    })

    const result = await cleanupReservedPosts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'list failed' })
  })

  it('Storage削除が失敗したら INTERNAL_ERROR を返す（posts行は既に削除済み）', async () => {
    const postId = '55555555-5555-4555-8555-555555555555'
    const { supabase } = mockClient({
      postsSelect: { data: [{ id: postId }], error: null },
      postsDelete: { data: [{ id: postId, author_id: authorId }], error: null },
      storageList: { [`${authorId}/${postId}`]: { data: [{ name: '1.webp' }] } },
      storageRemove: { error: { message: 'storage down' } },
    })

    const result = await cleanupReservedPosts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'storage down' })
  })

  it('Storage削除が失敗したら、消せなかったimagePathsをreportErrorのcauseに含める（D75: 永久孤立の可視化）', async () => {
    const postId = '55555555-5555-4555-8555-555555555555'
    const { supabase } = mockClient({
      postsSelect: { data: [{ id: postId }], error: null },
      postsDelete: { data: [{ id: postId, author_id: authorId }], error: null },
      storageList: { [`${authorId}/${postId}`]: { data: [{ name: '1.webp' }] } },
      storageRemove: { error: { message: 'storage down' } },
    })

    await cleanupReservedPosts(supabase as unknown as SupabaseClient<Database>)

    expect(reportError).toHaveBeenCalledWith(
      'cleanup-reserved-posts',
      'Storage画像の削除に失敗',
      expect.objectContaining({
        imagePaths: [`${authorId}/${postId}/1.webp`],
      }),
    )
  })

  it('21件削除された場合、Storage列挙は20件ずつチャンクに分けて実行する（D75: 同時実行数の上限）', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `post-${i}`,
      author_id: authorId,
    }))
    const storageList = Object.fromEntries(
      rows.map((row) => [`${authorId}/${row.id}`, { data: [] }]),
    )
    const { supabase, listSpy } = mockClient({
      postsSelect: { data: rows.map((row) => ({ id: row.id })), error: null },
      postsDelete: { data: rows, error: null },
      storageList,
    })

    let maxConcurrent = 0
    let current = 0
    listSpy.mockImplementation((prefix: string) => {
      current++
      maxConcurrent = Math.max(maxConcurrent, current)
      return Promise.resolve(storageList[prefix] ?? { data: [] }).finally(() => {
        current--
      })
    })

    const result = await cleanupReservedPosts(supabase as unknown as SupabaseClient<Database>)

    expect(result.ok).toBe(true)
    expect(listSpy).toHaveBeenCalledTimes(21)
    expect(maxConcurrent).toBeLessThanOrEqual(20)
  })
})
