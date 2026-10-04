import { act, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDeferredRefresh } from './use-deferred-refresh'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

beforeEach(() => {
  refresh.mockReset()
})

describe('useDeferredRefresh', () => {
  it('マウント直後には refresh() を呼ばない', () => {
    renderHook(() => useDeferredRefresh())
    expect(refresh).not.toHaveBeenCalled()
  })

  it('返り値の関数を呼ぶとコミット後に refresh() する', () => {
    const { result } = renderHook(() => useDeferredRefresh())

    act(() => {
      result.current()
    })

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('複数回呼ぶと呼んだ回数だけ refresh() する', () => {
    const { result } = renderHook(() => useDeferredRefresh())

    act(() => {
      result.current()
    })
    act(() => {
      result.current()
    })

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  // StrictMode は開発時、mount の effect を「実行 → cleanup → 実行」と二重に走らせる。
  // 真偽値のフラグで「初回か」を判定すると、1回目の実行で true にした直後の2回目の
  // 実行でガードをすり抜け、マウントのたびに refresh() が誤発火する
  it('StrictMode の開発時二重実行でもマウント直後に refresh() しない', () => {
    renderHook(() => useDeferredRefresh(), { wrapper: StrictMode })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('StrictMode下でも返り値の関数を呼べば refresh() する', () => {
    const { result } = renderHook(() => useDeferredRefresh(), { wrapper: StrictMode })

    act(() => {
      result.current()
    })

    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
