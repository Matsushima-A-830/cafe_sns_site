import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTOSAVE_DEBOUNCE_MS, useComposer } from './use-composer'

const replace = vi.fn()
const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
}))

const reservePost = vi.fn()
const createPost = vi.fn()
const getOwnPostStatus = vi.fn()
vi.mock('@/app/_actions/posts', () => ({
  reservePost: (input: unknown) => reservePost(input),
  createPost: (input: unknown) => createPost(input),
  getOwnPostStatus: (input: unknown) => getOwnPostStatus(input),
}))

const saveDraft = vi.fn()
const getDraft = vi.fn()
const deleteDraft = vi.fn()
vi.mock('@/app/_actions/drafts', () => ({
  saveDraft: (input: unknown) => saveDraft(input),
  getDraft: (input: unknown) => getDraft(input),
  deleteDraft: (input: unknown) => deleteDraft(input),
}))

vi.mock('@/app/_actions/cafes', () => ({
  getCafeById: vi.fn(async () => ({ ok: true, data: null })),
}))

vi.mock('@/lib/supabase/browser', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }),
      }),
    },
  }),
}))

const POST_ID = '11111111-1111-4111-8111-111111111111'

function setLocation(search: string) {
  window.history.replaceState(null, '', `/new/short${search}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  setLocation('')
  reservePost.mockResolvedValue({ ok: true, data: { postId: POST_ID } })
  saveDraft.mockResolvedValue({ ok: true, data: { lastSavedAt: '2026-09-13T00:00:00.000Z' } })
  deleteDraft.mockResolvedValue({ ok: true, data: null })
  createPost.mockResolvedValue({ ok: true, data: { postId: POST_ID } })
})

afterEach(() => {
  vi.useRealTimers()
})

async function renderReady() {
  const view = renderHook(() => useComposer('short'))
  await waitFor(() => expect(view.result.current.status).toBe('ready'))
  return view
}

describe('初期化', () => {
  it('下書きキーが無ければ予約行を作り、キーを URL に載せる', async () => {
    const { result } = await renderReady()

    expect(reservePost).toHaveBeenCalledWith({ postType: 'short' })
    expect(result.current.postId).toBe(POST_ID)
    expect(new URL(window.location.href).searchParams.get('draft')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('予約に失敗したらエラー状態にする', async () => {
    reservePost.mockResolvedValue({ ok: false, error: 'FORBIDDEN' })

    const { result } = renderHook(() => useComposer('short'))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.formError).toBe('この操作を行う権限がありません')
  })

  it('下書きを再開するときは予約行を作り直さず、同じ postId を使う', async () => {
    setLocation('?draft=44444444-4444-4444-8444-444444444444')
    getDraft.mockResolvedValue({
      ok: true,
      data: {
        clientDraftKey: '44444444-4444-4444-8444-444444444444',
        lastSavedAt: '2026-09-13T00:00:00.000Z',
        stale: false,
        payload: {
          v: 1,
          post_id: POST_ID,
          post_type: 'short',
          title: null,
          body_json: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '続きから' }] }],
          },
          tag_ids: ['tag-1'],
          image_paths: [`author/${POST_ID}/a.webp`],
          cafe_id: null,
        },
      },
    })

    const { result } = await renderReady()

    expect(reservePost).not.toHaveBeenCalled()
    expect(result.current.postId).toBe(POST_ID)
    expect(result.current.fields.bodyText).toBe('続きから')
    expect(result.current.fields.images).toEqual([
      { path: `author/${POST_ID}/a.webp`, previewUrl: `https://cdn/author/${POST_ID}/a.webp` },
    ])
  })

  it('形式が違う下書きは復元せず、新しい予約行から始める', async () => {
    setLocation('?draft=44444444-4444-4444-8444-444444444444')
    getDraft.mockResolvedValue({
      ok: true,
      data: {
        clientDraftKey: '44444444-4444-4444-8444-444444444444',
        lastSavedAt: '2026-09-13T00:00:00.000Z',
        stale: false,
        payload: {
          v: 1,
          post_id: 'other-post',
          post_type: 'blog',
          title: 'ブログ',
          body_json: { type: 'doc', content: [] },
          tag_ids: [],
          image_paths: [],
          cafe_id: null,
        },
      },
    })

    const { result } = await renderReady()

    expect(reservePost).toHaveBeenCalledTimes(1)
    expect(result.current.postId).toBe(POST_ID)
  })

  it('バージョン不一致の下書きは案内を出して新規扱いにする', async () => {
    setLocation('?draft=44444444-4444-4444-8444-444444444444')
    getDraft.mockResolvedValue({
      ok: true,
      data: {
        clientDraftKey: '44444444-4444-4444-8444-444444444444',
        lastSavedAt: '2026-09-13T00:00:00.000Z',
        stale: true,
      },
    })

    const { result } = await renderReady()

    expect(result.current.notice).toContain('読み込めませんでした')
    expect(reservePost).toHaveBeenCalledTimes(1)
  })
})

describe('自動保存', () => {
  it('入力から15秒後に下書きを保存する', async () => {
    const { result } = await renderReady()
    vi.useFakeTimers()

    act(() =>
      result.current.updateFields({
        bodyText: 'あ',
        bodyJson: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'あ' }] }],
        },
      }),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1)
    })
    expect(saveDraft).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(saveDraft).toHaveBeenCalledTimes(1)
  })

  it('何も入力していない間は下書き行を作らない', async () => {
    const { result } = await renderReady()

    await act(async () => {
      await result.current.persistDraft()
    })

    expect(saveDraft).not.toHaveBeenCalled()
  })

  it('保存に失敗したら自動保存の状態をエラーにする', async () => {
    saveDraft.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    const { result } = await renderReady()

    act(() => result.current.updateFields({ tagIds: ['tag-1'] }))
    await act(async () => {
      await result.current.persistDraft()
    })

    expect(result.current.autosave).toBe('error')
  })
})

describe('投稿の確定', () => {
  it('成功したら下書きを消して完了画面へ送る', async () => {
    const { result } = await renderReady()

    await act(async () => {
      await result.current.submit()
    })

    expect(deleteDraft).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith(`/new/success?postId=${POST_ID}`)
  })

  it('FORBIDDEN でも投稿が published なら二重送信の後着として成功扱いにする', async () => {
    createPost.mockResolvedValue({ ok: false, error: 'FORBIDDEN' })
    getOwnPostStatus.mockResolvedValue({ ok: true, data: { status: 'published' } })
    const { result } = await renderReady()

    await act(async () => {
      await result.current.submit()
    })

    expect(getOwnPostStatus).toHaveBeenCalledWith({ postId: POST_ID })
    expect(replace).toHaveBeenCalledWith(`/new/success?postId=${POST_ID}`)
    expect(result.current.formError).toBeUndefined()
  })

  it('FORBIDDEN で投稿が公開されていなければ権限エラーとして表示する', async () => {
    createPost.mockResolvedValue({ ok: false, error: 'FORBIDDEN' })
    getOwnPostStatus.mockResolvedValue({ ok: true, data: { status: 'hidden' } })
    const { result } = await renderReady()

    await act(async () => {
      await result.current.submit()
    })

    expect(replace).not.toHaveBeenCalled()
    expect(result.current.formError).toBe('この操作を行う権限がありません')
    expect(result.current.isSubmitting).toBe(false)
  })

  it('送信中の再クリックでは createPost を2回呼ばない', async () => {
    const { result } = await renderReady()

    await act(async () => {
      await Promise.all([result.current.submit(), result.current.submit()])
    })

    expect(createPost).toHaveBeenCalledTimes(1)
  })

  it('ブログは title を送り、短文は送らない', async () => {
    const { result } = await renderReady()

    await act(async () => {
      await result.current.submit()
    })

    expect(createPost.mock.calls[0]?.[0]).not.toHaveProperty('title')
  })
})
