import { afterEach, describe, expect, it, vi } from 'vitest'
import { claimCafe, withdrawClaim } from './owner'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

const userId = '11111111-1111-4111-8111-111111111111'
const cafeId = '22222222-2222-4222-8222-222222222222'
const verificationId = '33333333-3333-4333-8333-333333333333'

const documents = [
  { type: 'business_license', path: `${userId}/${verificationId}/a.pdf` },
  { type: 'corporate_registry', path: `${userId}/${verificationId}/b.pdf` },
] as const

function buildClaimInput(overrides: Record<string, unknown> = {}) {
  return {
    cafeId,
    documents,
    contactEmail: 'owner@example.com',
    ...overrides,
  }
}

function buildSupabaseStub(
  options: {
    user?: { id: string } | null
    insertError?: { code: string; message: string } | null
    insertData?: { id: string } | null
  } = {},
) {
  const user = 'user' in options ? options.user : { id: userId }
  const single = vi.fn().mockResolvedValue({
    data: options.insertData ?? { id: verificationId },
    error: options.insertError ?? null,
  })
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select }))

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn(() => ({ insert })),
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('claimCafe', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await claimCafe(buildClaimInput({ cafeId: 'not-a-uuid' }))

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('書類1点だけは INVALID_INPUT を返す', async () => {
    const result = await claimCafe(buildClaimInput({ documents: [documents[0]] }))

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    createClientMock.mockResolvedValue(buildSupabaseStub({ user: null }))

    const result = await claimCafe(buildClaimInput())

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('成功時は verificationId を返す', async () => {
    createClientMock.mockResolvedValue(buildSupabaseStub())

    const result = await claimCafe(buildClaimInput())

    expect(result).toEqual({ ok: true, data: { verificationId } })
  })

  it('トリガーの CAFE_ALREADY_CLAIMED 例外はそのまま返す', async () => {
    createClientMock.mockResolvedValue(
      buildSupabaseStub({ insertError: { code: 'P0001', message: 'CAFE_ALREADY_CLAIMED' } }),
    )

    const result = await claimCafe(buildClaimInput())

    expect(result).toEqual({ ok: false, error: 'CAFE_ALREADY_CLAIMED' })
  })

  it('部分ユニーク制約違反（同カフェへの重複pending申請）は VERIFICATION_ALREADY_PENDING を返す', async () => {
    createClientMock.mockResolvedValue(
      buildSupabaseStub({
        insertError: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "cafe_owner_verifications_pending_unique"',
        },
      }),
    )

    const result = await claimCafe(buildClaimInput())

    expect(result).toEqual({ ok: false, error: 'VERIFICATION_ALREADY_PENDING' })
  })

  it('CHECK制約違反（書類2点未満）は DOCUMENTS_INSUFFICIENT を返す', async () => {
    createClientMock.mockResolvedValue(
      buildSupabaseStub({
        insertError: {
          code: '23514',
          message: 'violates check constraint "cafe_owner_verifications_documents_check"',
        },
      }),
    )

    const result = await claimCafe(buildClaimInput())

    expect(result).toEqual({ ok: false, error: 'DOCUMENTS_INSUFFICIENT' })
  })

  it('存在しないカフェへの申請は CAFE_NOT_FOUND を返す', async () => {
    createClientMock.mockResolvedValue(
      buildSupabaseStub({
        insertError: {
          code: '23503',
          message: 'violates foreign key constraint "cafe_owner_verifications_cafe_id_fkey"',
        },
      }),
    )

    const result = await claimCafe(buildClaimInput())

    expect(result).toEqual({ ok: false, error: 'CAFE_NOT_FOUND' })
  })

  it('RLS(42501) は FORBIDDEN を返す', async () => {
    createClientMock.mockResolvedValue(
      buildSupabaseStub({ insertError: { code: '42501', message: 'permission denied' } }),
    )

    const result = await claimCafe(buildClaimInput())

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('想定外のエラーコードは INTERNAL_ERROR を返す', async () => {
    createClientMock.mockResolvedValue(
      buildSupabaseStub({ insertError: { code: 'XXXXX', message: 'boom' } }),
    )

    const result = await claimCafe(buildClaimInput())

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})

function buildWithdrawSupabaseStub(
  options: {
    user?: { id: string } | null
    updateError?: { code: string; message: string } | null
    updateData?: { id: string }[] | null
  } = {},
) {
  const user = 'user' in options ? options.user : { id: userId }
  const select = vi.fn().mockResolvedValue({
    data: options.updateData ?? [{ id: verificationId }],
    error: options.updateError ?? null,
  })
  const eqUserId = vi.fn(() => ({ select }))
  const eqId = vi.fn(() => ({ eq: eqUserId }))
  const update = vi.fn(() => ({ eq: eqId }))

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn(() => ({ update })),
  }
}

describe('withdrawClaim', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await withdrawClaim({ verificationId: 'not-a-uuid' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    createClientMock.mockResolvedValue(buildWithdrawSupabaseStub({ user: null }))

    const result = await withdrawClaim({ verificationId })

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('成功時は data:null を返す', async () => {
    createClientMock.mockResolvedValue(buildWithdrawSupabaseStub())

    const result = await withdrawClaim({ verificationId })

    expect(result).toEqual({ ok: true, data: null })
  })

  it('他人の申請・pending以外はRLSに弾かれ0件更新になり NOT_FOUND を返す', async () => {
    createClientMock.mockResolvedValue(buildWithdrawSupabaseStub({ updateData: [] }))

    const result = await withdrawClaim({ verificationId })

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' })
  })

  it('RLS(42501) は FORBIDDEN を返す', async () => {
    createClientMock.mockResolvedValue(
      buildWithdrawSupabaseStub({ updateError: { code: '42501', message: 'permission denied' } }),
    )

    const result = await withdrawClaim({ verificationId })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('想定外のエラーコードは INTERNAL_ERROR を返す', async () => {
    createClientMock.mockResolvedValue(
      buildWithdrawSupabaseStub({ updateError: { code: 'XXXXX', message: 'boom' } }),
    )

    const result = await withdrawClaim({ verificationId })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})
