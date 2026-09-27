import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendEmail } from './resend'

// 'server-only' はNextのビルド時に特別扱いされる薄いガードで、vitestではただ throw するだけ
vi.mock('server-only', () => ({}))

const { sendMock, serverEnvMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  serverEnvMock: {
    RESEND_API_KEY: 'test-key',
    RESEND_FROM_EMAIL: 'onboarding@resend.dev',
  },
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))

vi.mock('@/lib/env.server', () => ({
  serverEnv: serverEnvMock,
}))

afterEach(() => {
  vi.clearAllMocks()
  serverEnvMock.RESEND_API_KEY = 'test-key'
})

describe('sendEmail', () => {
  it('RESEND_API_KEY 未設定なら送信せず失敗を返す', async () => {
    serverEnvMock.RESEND_API_KEY = ''

    const result = await sendEmail({ to: 'a@example.com', subject: 's', html: '<p>x</p>' })

    expect(result).toEqual({ ok: false, error: 'RESEND_API_KEY_MISSING' })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('Resend送信が成功したら ok:true を返す', async () => {
    sendMock.mockResolvedValue({ data: { id: 'x' }, error: null })

    const result = await sendEmail({ to: 'a@example.com', subject: 's', html: '<p>x</p>' })

    expect(result).toEqual({ ok: true })
    expect(sendMock).toHaveBeenCalledWith({
      from: 'onboarding@resend.dev',
      to: 'a@example.com',
      subject: 's',
      html: '<p>x</p>',
    })
  })

  it('Resend送信が失敗したら ok:false とエラーメッセージを返す', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: '送信失敗' } })

    const result = await sendEmail({ to: 'a@example.com', subject: 's', html: '<p>x</p>' })

    expect(result).toEqual({ ok: false, error: '送信失敗' })
  })
})
