import { act, renderHook } from '@testing-library/react'
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
})
