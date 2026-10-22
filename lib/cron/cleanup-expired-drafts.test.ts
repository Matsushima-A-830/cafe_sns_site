import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '@/types/database'
import { cleanupExpiredDrafts } from './cleanup-expired-drafts'

/** select().lt().limit() の末に await されるチェーンを模す（admin-reports.test.ts と同じ手法） */
function makeSelectChain(terminalResult: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'lt', 'limit']) {
    chain[method] = vi.fn(() => chain)
  }
  Object.defineProperty(chain, 'then', {
    value: (resolve: (value: unknown) => void, reject?: (error: unknown) => void) =>
      Promise.resolve(terminalResult).then(resolve, reject),
  })
  return chain
}

/** delete().in().lt().select() の末に await されるチェーン */
function makeDeleteChain(terminalResult: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  for (const method of ['in', 'lt']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.select = vi.fn().mockResolvedValue(terminalResult)
  return chain
}

type Options = {
  draftsSelect?: { data: Array<{ id: string; payload: unknown }> | null; error?: unknown }
  draftsDelete?: { data?: Array<{ id: string }> | null; error?: unknown }
  storageRemove?: { error?: unknown }
}

function mockClient(options: Options = {}) {
  const selectResult = options.draftsSelect ?? { data: [], error: null }
  const selectSpy = vi.fn(() => makeSelectChain(selectResult))

  // SELECTで取れた行がそのまま削除される想定のデフォルト。
  // 「自動保存で生き残った行がある」ケースだけテストごとに draftsDelete.data で上書きする
  const defaultDeletedRows = (selectResult.data ?? []).map((row) => ({ id: row.id }))
  const deleteResult = options.draftsDelete ?? { data: defaultDeletedRows, error: null }
  const deleteSpy = vi.fn(() => makeDeleteChain(deleteResult))
  const draftsTable = { select: selectSpy, delete: deleteSpy }

  const removeSpy = vi.fn().mockResolvedValue(options.storageRemove ?? { error: null })

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'drafts') return draftsTable
      throw new Error(`unexpected table: ${table}`)
    }),
    storage: { from: vi.fn(() => ({ remove: removeSpy })) },
  }

  return { supabase, selectSpy, deleteSpy, removeSpy }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('cleanupExpiredDrafts', () => {
  it('対象が0件なら Storage削除もdraftsのDELETEも呼ばない', async () => {
    const { supabase, removeSpy, deleteSpy } = mockClient({
      draftsSelect: { data: [], error: null },
    })

    const result = await cleanupExpiredDrafts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: true, data: { deletedDraftCount: 0, deletedImageCount: 0 } })
    expect(removeSpy).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('期限切れ下書きの image_paths をまとめて Storage から削除し、drafts行も削除する', async () => {
    const draftId1 = '11111111-1111-4111-8111-111111111111'
    const draftId2 = '22222222-2222-4222-8222-222222222222'
    const { supabase, removeSpy, deleteSpy } = mockClient({
      draftsSelect: {
        data: [
          { id: draftId1, payload: { v: 1, image_paths: ['a/b/1.webp', 'a/b/2.webp'] } },
          { id: draftId2, payload: { v: 1, image_paths: ['c/d/3.webp'] } },
        ],
        error: null,
      },
    })

    const result = await cleanupExpiredDrafts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: true, data: { deletedDraftCount: 2, deletedImageCount: 3 } })
    expect(removeSpy).toHaveBeenCalledWith(['a/b/1.webp', 'a/b/2.webp', 'c/d/3.webp'])
    expect(deleteSpy).toHaveBeenCalled()
  })

  it('image_paths が無い・壊れた payload（stale）でも drafts行の削除は行う', async () => {
    const draftId = '33333333-3333-4333-8333-333333333333'
    const { supabase, removeSpy, deleteSpy } = mockClient({
      draftsSelect: {
        data: [{ id: draftId, payload: { v: 0, broken: true } }],
        error: null,
      },
    })

    const result = await cleanupExpiredDrafts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: true, data: { deletedDraftCount: 1, deletedImageCount: 0 } })
    expect(removeSpy).not.toHaveBeenCalled()
    expect(deleteSpy).toHaveBeenCalled()
  })

  it('SELECTとDELETEの間に自動保存でexpires_atが延長された行は、DELETEのlt再判定で消さない', async () => {
    const survivedDraftId = '66666666-6666-4666-8666-666666666666'
    const deletedDraftId = '77777777-7777-4777-8777-777777777777'
    const { supabase, deleteSpy } = mockClient({
      draftsSelect: {
        data: [
          { id: survivedDraftId, payload: { v: 1, image_paths: [] } },
          { id: deletedDraftId, payload: { v: 1, image_paths: [] } },
        ],
        error: null,
      },
      // DELETE側の lt('expires_at', cutoff) 再判定により、延長された survivedDraftId は
      // 実際には削除されない（Postgrestが実際に消えた行だけを返す想定）
      draftsDelete: { data: [{ id: deletedDraftId }], error: null },
    })

    const result = await cleanupExpiredDrafts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: true, data: { deletedDraftCount: 1, deletedImageCount: 0 } })
    expect(deleteSpy).toHaveBeenCalled()
  })

  it('drafts取得が失敗したら INTERNAL_ERROR を返し、Storage削除もDELETEも呼ばない', async () => {
    const { supabase, removeSpy, deleteSpy } = mockClient({
      draftsSelect: { data: null, error: { message: 'boom' } },
    })

    const result = await cleanupExpiredDrafts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'boom' })
    expect(removeSpy).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('Storage削除が失敗したら drafts行は削除せず INTERNAL_ERROR を返す', async () => {
    const draftId = '44444444-4444-4444-8444-444444444444'
    const { supabase, deleteSpy } = mockClient({
      draftsSelect: {
        data: [{ id: draftId, payload: { v: 1, image_paths: ['a/b/1.webp'] } }],
        error: null,
      },
      storageRemove: { error: { message: 'storage down' } },
    })

    const result = await cleanupExpiredDrafts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'storage down' })
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('drafts行のDELETEが失敗したら INTERNAL_ERROR を返す', async () => {
    const draftId = '55555555-5555-4555-8555-555555555555'
    const { supabase } = mockClient({
      draftsSelect: { data: [{ id: draftId, payload: { v: 1, image_paths: [] } }], error: null },
      draftsDelete: { error: { message: 'delete failed' } },
    })

    const result = await cleanupExpiredDrafts(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'delete failed' })
  })
})
