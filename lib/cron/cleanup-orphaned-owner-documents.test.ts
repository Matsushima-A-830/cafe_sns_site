import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '@/types/database'
import { cleanupOrphanedOwnerDocuments } from './cleanup-orphaned-owner-documents'

type Entry = { name: string; created_at: string | null }

type Options = {
  /** key: list() に渡されたprefix */
  storageEntries?: Record<string, Entry[]>
  storageListError?: { prefix: string; message: string }
  verificationsSelect?: { data: Array<{ document_urls: unknown }> | null; error?: unknown }
  storageRemove?: { error?: unknown }
}

function mockClient(options: Options = {}) {
  const entries = options.storageEntries ?? { '': [] }
  const listSpy = vi.fn((prefix: string) => {
    if (options.storageListError?.prefix === prefix) {
      return Promise.resolve({ data: null, error: { message: options.storageListError.message } })
    }
    return Promise.resolve({ data: entries[prefix] ?? [], error: null })
  })
  const removeSpy = vi.fn().mockResolvedValue(options.storageRemove ?? { error: null })

  const verificationsResult = options.verificationsSelect ?? { data: [], error: null }
  const selectSpy = vi.fn().mockResolvedValue(verificationsResult)
  const verificationsTable = { select: selectSpy }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'cafe_owner_verifications') return verificationsTable
      throw new Error(`unexpected table: ${table}`)
    }),
    storage: { from: vi.fn(() => ({ list: listSpy, remove: removeSpy })) },
  }

  return { supabase, listSpy, removeSpy, selectSpy }
}

afterEach(() => {
  vi.clearAllMocks()
})

const OLD = '2020-01-01T00:00:00Z'
const RECENT = new Date().toISOString()

describe('cleanupOrphanedOwnerDocuments', () => {
  it('Storageが空なら何も削除しない', async () => {
    const { supabase, removeSpy } = mockClient({ storageEntries: { '': [] } })

    const result = await cleanupOrphanedOwnerDocuments(
      supabase as unknown as SupabaseClient<Database>,
    )

    expect(result).toEqual({ ok: true, data: { deletedFileCount: 0 } })
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it('document_urlsに参照されているファイルは、古くても削除しない', async () => {
    const { supabase, removeSpy } = mockClient({
      storageEntries: {
        '': [{ name: 'user-1', created_at: null }],
        'user-1': [{ name: 'verif-1', created_at: null }],
        'user-1/verif-1': [{ name: 'a.jpg', created_at: OLD }],
      },
      verificationsSelect: {
        data: [{ document_urls: [{ type: 'id_card', path: 'user-1/verif-1/a.jpg' }] }],
        error: null,
      },
    })

    const result = await cleanupOrphanedOwnerDocuments(
      supabase as unknown as SupabaseClient<Database>,
    )

    expect(result).toEqual({ ok: true, data: { deletedFileCount: 0 } })
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it('approved済みなどstatusを問わず、参照されていれば保護する', async () => {
    // statusでは絞らず document_urls との一致だけで判定することの回帰テスト
    const { supabase, removeSpy } = mockClient({
      storageEntries: {
        '': [{ name: 'user-1', created_at: null }],
        'user-1': [{ name: 'verif-1', created_at: null }],
        'user-1/verif-1': [{ name: 'a.jpg', created_at: OLD }],
      },
      verificationsSelect: {
        data: [{ document_urls: [{ type: 'id_card', path: 'user-1/verif-1/a.jpg' }] }],
        error: null,
      },
    })

    await cleanupOrphanedOwnerDocuments(supabase as unknown as SupabaseClient<Database>)

    expect(removeSpy).not.toHaveBeenCalled()
  })

  it('どの行からも参照されず、生成から7日以上経過したファイルだけ削除する', async () => {
    const { supabase, removeSpy } = mockClient({
      storageEntries: {
        '': [{ name: 'user-1', created_at: null }],
        'user-1': [{ name: 'verif-1', created_at: null }],
        'user-1/verif-1': [
          { name: 'old-orphan.jpg', created_at: OLD },
          { name: 'recent-orphan.jpg', created_at: RECENT },
        ],
      },
      verificationsSelect: { data: [], error: null },
    })

    const result = await cleanupOrphanedOwnerDocuments(
      supabase as unknown as SupabaseClient<Database>,
    )

    expect(result).toEqual({ ok: true, data: { deletedFileCount: 1 } })
    expect(removeSpy).toHaveBeenCalledWith(['user-1/verif-1/old-orphan.jpg'])
  })

  it('Storageの列挙が失敗したら INTERNAL_ERROR を返し、削除もDB取得結果も使わない', async () => {
    const { supabase, removeSpy } = mockClient({
      storageEntries: { '': [{ name: 'user-1', created_at: null }] },
      storageListError: { prefix: 'user-1', message: 'list failed' },
    })

    const result = await cleanupOrphanedOwnerDocuments(
      supabase as unknown as SupabaseClient<Database>,
    )

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'list failed' })
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it('cafe_owner_verificationsの取得が失敗したら INTERNAL_ERROR を返す', async () => {
    const { supabase, removeSpy } = mockClient({
      storageEntries: { '': [] },
      verificationsSelect: { data: null, error: { message: 'db down' } },
    })

    const result = await cleanupOrphanedOwnerDocuments(
      supabase as unknown as SupabaseClient<Database>,
    )

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'db down' })
    expect(removeSpy).not.toHaveBeenCalled()
  })

  it('Storageの削除が失敗したら INTERNAL_ERROR を返す', async () => {
    const { supabase } = mockClient({
      storageEntries: {
        '': [{ name: 'user-1', created_at: null }],
        'user-1': [{ name: 'verif-1', created_at: null }],
        'user-1/verif-1': [{ name: 'old-orphan.jpg', created_at: OLD }],
      },
      verificationsSelect: { data: [], error: null },
      storageRemove: { error: { message: 'storage down' } },
    })

    const result = await cleanupOrphanedOwnerDocuments(
      supabase as unknown as SupabaseClient<Database>,
    )

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'storage down' })
  })
})
