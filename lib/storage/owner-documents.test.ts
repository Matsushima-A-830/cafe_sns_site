import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '@/types/database'
import { listAllOwnerDocumentPaths } from './owner-documents'

type Entry = { name: string; created_at: string | null }

/** key: list() に渡された prefix。実ファイルは created_at あり、フォルダは null */
function mockClient(entriesByPrefix: Record<string, Entry[]>) {
  const listSpy = vi.fn((prefix: string) => {
    const data = entriesByPrefix[prefix] ?? []
    return Promise.resolve({ data, error: null })
  })

  const supabase = { storage: { from: vi.fn(() => ({ list: listSpy })) } }
  return { supabase, listSpy }
}

describe('listAllOwnerDocumentPaths', () => {
  it('user_id/verification_id の2階層を辿り、実ファイルのパスとcreated_atを返す', async () => {
    const { supabase } = mockClient({
      '': [{ name: 'user-1', created_at: null }],
      'user-1': [{ name: 'verif-1', created_at: null }],
      'user-1/verif-1': [
        { name: 'a.jpg', created_at: '2026-01-01T00:00:00Z' },
        { name: 'b.pdf', created_at: '2026-01-02T00:00:00Z' },
      ],
    })

    const result = await listAllOwnerDocumentPaths(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({
      ok: true,
      data: [
        { path: 'user-1/verif-1/a.jpg', createdAt: '2026-01-01T00:00:00Z' },
        { path: 'user-1/verif-1/b.pdf', createdAt: '2026-01-02T00:00:00Z' },
      ],
    })
  })

  it('複数のユーザー・複数の申請フォルダを横断して列挙する', async () => {
    const { supabase } = mockClient({
      '': [
        { name: 'user-1', created_at: null },
        { name: 'user-2', created_at: null },
      ],
      'user-1': [{ name: 'verif-1', created_at: null }],
      'user-2': [
        { name: 'verif-2', created_at: null },
        { name: 'verif-3', created_at: null },
      ],
      'user-1/verif-1': [{ name: 'a.jpg', created_at: '2026-01-01T00:00:00Z' }],
      'user-2/verif-2': [{ name: 'b.jpg', created_at: '2026-01-02T00:00:00Z' }],
      'user-2/verif-3': [{ name: 'c.jpg', created_at: '2026-01-03T00:00:00Z' }],
    })

    const result = await listAllOwnerDocumentPaths(supabase as unknown as SupabaseClient<Database>)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.map((f) => f.path).sort()).toEqual([
      'user-1/verif-1/a.jpg',
      'user-2/verif-2/b.jpg',
      'user-2/verif-3/c.jpg',
    ])
  })

  it('バケットが空なら空配列を返す', async () => {
    const { supabase, listSpy } = mockClient({ '': [] })

    const result = await listAllOwnerDocumentPaths(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: true, data: [] })
    expect(listSpy).toHaveBeenCalledTimes(1)
  })

  it('途中階層の列挙が失敗したら INTERNAL_ERROR を返す', async () => {
    const listSpy = vi.fn((prefix: string) => {
      if (prefix === '')
        return Promise.resolve({ data: [{ name: 'user-1', created_at: null }], error: null })
      if (prefix === 'user-1') {
        return Promise.resolve({ data: null, error: { message: 'list failed' } })
      }
      throw new Error(`unexpected prefix: ${prefix}`)
    })
    const supabase = { storage: { from: vi.fn(() => ({ list: listSpy })) } }

    const result = await listAllOwnerDocumentPaths(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'list failed' })
  })

  it('直下にファイルが直接置かれていても（想定外のネスト）クラッシュせずスキップする', async () => {
    const { supabase } = mockClient({
      '': [{ name: 'stray-file.txt', created_at: '2026-01-01T00:00:00Z' }],
    })

    const result = await listAllOwnerDocumentPaths(supabase as unknown as SupabaseClient<Database>)

    expect(result).toEqual({ ok: true, data: [] })
  })
})
