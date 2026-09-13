import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_RETRY_MS, useComposer } from './use-composer'

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

  it('StrictMode で effect が2回走っても初期化が完了する', async () => {
    const { result } = renderHook(() => useComposer('short'), { wrapper: StrictMode })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(reservePost).toHaveBeenCalledTimes(1)
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
          visibility: 'followers',
        },
      },
    })

    const { result } = await renderReady()

    expect(reservePost).not.toHaveBeenCalled()
    expect(result.current.fields.visibility).toBe('followers')
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
          visibility: 'public',
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

  it('公開範囲も下書きに含めて保存する', async () => {
    const { result } = await renderReady()

    act(() => result.current.updateFields({ tagIds: ['tag-1'], visibility: 'followers' }))
    await act(async () => {
      await result.current.persistDraft()
    })

    expect(saveDraft.mock.calls[0]?.[0]).toMatchObject({
      payload: { visibility: 'followers' },
    })
  })

  it('保存に失敗しても、未保存の変更が残っている間は再試行する', async () => {
    saveDraft.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    const { result } = await renderReady()
    vi.useFakeTimers()

    act(() => result.current.updateFields({ tagIds: ['tag-1'] }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)
    })
    expect(saveDraft).toHaveBeenCalledTimes(1)
    expect(result.current.autosave).toBe('error')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_MS)
    })
    expect(saveDraft).toHaveBeenCalledTimes(2)
  })

  it('投稿確定中は下書きを書き戻さない（公開済み postId の下書きが復活するため）', async () => {
    // createPost の解決を握り、その最中に自動保存を走らせる
    let finishCreate: (() => void) | undefined
    createPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCreate = () => resolve({ ok: true, data: { postId: POST_ID } })
        }),
    )
    const { result } = await renderReady()
    act(() => result.current.updateFields({ tagIds: ['tag-1'] }))

    await act(async () => {
      // submit は createPost の解決待ちで止まる。その最中に自動保存が着地する状況を作る
      const submitted = result.current.submit()
      expect(await result.current.persistDraft()).toBe('skipped')
      finishCreate?.()
      await submitted
    })

    expect(saveDraft).not.toHaveBeenCalled()
    expect(deleteDraft).toHaveBeenCalledTimes(1)
  })

  it('いったん保存した下書きは、内容を全部消しても空のまま保存し直す', async () => {
    const { result } = await renderReady()

    act(() => result.current.updateFields({ tagIds: ['tag-1'] }))
    await act(async () => {
      expect(await result.current.persistDraft()).toBe('saved')
    })

    act(() => result.current.updateFields({ tagIds: [] }))
    await act(async () => {
      expect(await result.current.persistDraft()).toBe('saved')
    })

    expect(saveDraft).toHaveBeenCalledTimes(2)
    expect(saveDraft.mock.calls[1]?.[0]).toMatchObject({ payload: { tag_ids: [] } })
  })

  it('一度も保存していない空の composer では下書き行を作らない', async () => {
    const { result } = await renderReady()

    await act(async () => {
      expect(await result.current.persistDraft()).toBe('skipped')
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

describe('離脱', () => {
  it('未編集のキャンセル（leave）では下書きを消さない', async () => {
    const { result } = await renderReady()

    act(() => result.current.leave())

    expect(deleteDraft).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/')
  })

  it('明示的な破棄では下書きを消す', async () => {
    const { result } = await renderReady()

    await act(async () => {
      await result.current.discard()
    })

    expect(deleteDraft).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/')
  })

  it('保存に失敗したら離脱せず false を返す', async () => {
    saveDraft.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    const { result } = await renderReady()

    act(() => result.current.updateFields({ tagIds: ['tag-1'] }))
    let left: boolean | undefined
    await act(async () => {
      left = await result.current.saveAndLeave()
    })

    expect(left).toBe(false)
    expect(push).not.toHaveBeenCalled()
    expect(result.current.isDirty).toBe(true)
  })

  it('保存できたら離脱する', async () => {
    const { result } = await renderReady()

    act(() => result.current.updateFields({ tagIds: ['tag-1'] }))
    await act(async () => {
      await result.current.saveAndLeave()
    })

    expect(saveDraft).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/')
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
