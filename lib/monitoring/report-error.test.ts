import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportError } from './report-error'

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('reportError', () => {
  it('console.error と Sentry.captureException の両方を呼ぶ', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cause = new Error('boom')

    reportError('blocks', 'ブロックに失敗', cause)

    expect(consoleErrorSpy).toHaveBeenCalledWith('[blocks] ブロックに失敗:', cause)
    expect(captureExceptionMock).toHaveBeenCalledWith(cause, { tags: { scope: 'blocks' } })
    consoleErrorSpy.mockRestore()
  })

  it('cause が Error でなければ scope/message から Error を組み立てて送信する', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    reportError('reports', '通報に失敗', { code: 'XXXXX' })

    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    const sentError = captureExceptionMock.mock.calls.at(0)?.[0]
    expect(sentError).toBeInstanceOf(Error)
    expect((sentError as Error).message).toBe('[reports] 通報に失敗')
    expect(captureExceptionMock).toHaveBeenCalledWith(sentError, { tags: { scope: 'reports' } })
  })
})
