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

  it('cause が Error でなければ scope/message から Error を組み立て、元の値を extra に残す', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cause = { code: 'XXXXX' }

    reportError('reports', '通報に失敗', cause)

    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    const sentError = captureExceptionMock.mock.calls.at(0)?.[0]
    expect(sentError).toBeInstanceOf(Error)
    expect((sentError as Error).message).toBe('[reports] 通報に失敗')
    expect(captureExceptionMock).toHaveBeenCalledWith(sentError, {
      tags: { scope: 'reports' },
      extra: { cause },
    })
  })

  it('cause が message を持つオブジェクトなら、そのmessageをタイトルに引き継ぐ', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cause = { message: '送信失敗' }

    reportError('email', 'Resend送信失敗', cause)

    const sentError = captureExceptionMock.mock.calls.at(0)?.[0]
    expect((sentError as Error).message).toBe('[email] Resend送信失敗: 送信失敗')
  })
})
