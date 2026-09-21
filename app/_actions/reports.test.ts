import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReport } from './reports'

const {
  createClientMock,
  getPostDetailMock,
  getCommentByIdMock,
  getProfileByIdMock,
  getCafeDetailMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getPostDetailMock: vi.fn(),
  getCommentByIdMock: vi.fn(),
  getProfileByIdMock: vi.fn(),
  getCafeDetailMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/posts/post-detail', () => ({ getPostDetail: getPostDetailMock }))
vi.mock('@/lib/posts/comments', () => ({ getCommentById: getCommentByIdMock }))
vi.mock('@/lib/profiles/public-profile', () => ({ getProfileById: getProfileByIdMock }))
vi.mock('@/lib/cafes/cafe-detail', () => ({ getCafeDetail: getCafeDetailMock }))

const reporterId = '11111111-1111-4111-8111-111111111111'
const targetId = '22222222-2222-4222-8222-222222222222'
const authorId = '33333333-3333-4333-8333-333333333333'

function buildSupabaseStub(
  options: {
    user?: { id: string } | null
    insertError?: { code: string; message: string } | null
  } = {},
) {
  const user = 'user' in options ? options.user : { id: reporterId }
  const insert = vi.fn().mockResolvedValue({ error: options.insertError ?? null })

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn(() => ({ insert })),
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('createReport', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await createReport({
      targetType: 'post',
      targetId: 'not-a-uuid',
      reason: 'spam',
    })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    createClientMock.mockResolvedValue(buildSupabaseStub({ user: null }))

    const result = await createReport({ targetType: 'post', targetId, reason: 'spam' })

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('対象の投稿が存在しなければ NOT_FOUND を返す', async () => {
    createClientMock.mockResolvedValue(buildSupabaseStub())
    getPostDetailMock.mockResolvedValue(null)

    const result = await createReport({ targetType: 'post', targetId, reason: 'spam' })

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' })
  })

  it('post の通報成功時は投稿の author.id を blockableUserId として返す', async () => {
    createClientMock.mockResolvedValue(buildSupabaseStub())
    getPostDetailMock.mockResolvedValue({ author: { id: authorId } })

    const result = await createReport({ targetType: 'post', targetId, reason: 'spam' })

    expect(result).toEqual({ ok: true, data: { blockableUserId: authorId } })
  })

  it('自分の投稿を自分で通報した場合は blockableUserId が null になる（自己ブロック提案を出さない）', async () => {
    createClientMock.mockResolvedValue(buildSupabaseStub())
    getPostDetailMock.mockResolvedValue({ author: { id: reporterId } })

    const result = await createReport({ targetType: 'post', targetId, reason: 'spam' })

    expect(result).toEqual({ ok: true, data: { blockableUserId: null } })
  })

  it('comment の通報成功時は authorId を blockableUserId として返す', async () => {
    createClientMock.mockResolvedValue(buildSupabaseStub())
    getCommentByIdMock.mockResolvedValue({ id: targetId, body: 'x', authorId, postId: 'p' })

    const result = await createReport({ targetType: 'comment', targetId, reason: 'other' })

    expect(result).toEqual({ ok: true, data: { blockableUserId: authorId } })
  })

  it('user の通報成功時は target_id そのものを blockableUserId として返す', async () => {
    createClientMock.mockResolvedValue(buildSupabaseStub())
    getProfileByIdMock.mockResolvedValue({ id: targetId })

    const result = await createReport({ targetType: 'user', targetId, reason: 'harassment' })

    expect(result).toEqual({ ok: true, data: { blockableUserId: targetId } })
  })

  it('cafe の通報成功時は blockableUserId が null（ブロック可能なユーザーが無い）', async () => {
    createClientMock.mockResolvedValue(buildSupabaseStub())
    getCafeDetailMock.mockResolvedValue({ id: targetId })

    const result = await createReport({ targetType: 'cafe', targetId, reason: 'privacy' })

    expect(result).toEqual({ ok: true, data: { blockableUserId: null } })
  })

  it('DB の部分ユニーク制約違反（未処理の重複通報）は REPORT_ALREADY_SUBMITTED を返す', async () => {
    createClientMock.mockResolvedValue(
      buildSupabaseStub({
        insertError: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "reports_open_unique"',
        },
      }),
    )
    getProfileByIdMock.mockResolvedValue({ id: targetId })

    const result = await createReport({ targetType: 'user', targetId, reason: 'spam' })

    expect(result).toEqual({ ok: false, error: 'REPORT_ALREADY_SUBMITTED' })
  })

  it('自己通報の CHECK 制約違反は SELF_REPORT_FORBIDDEN を返す', async () => {
    createClientMock.mockResolvedValue(
      buildSupabaseStub({
        insertError: {
          code: '23514',
          message: 'violates check constraint "reports_no_self_report"',
        },
      }),
    )
    getProfileByIdMock.mockResolvedValue({ id: targetId })

    const result = await createReport({ targetType: 'user', targetId, reason: 'spam' })

    expect(result).toEqual({ ok: false, error: 'SELF_REPORT_FORBIDDEN' })
  })

  it('RLS(42501) は FORBIDDEN を返す', async () => {
    createClientMock.mockResolvedValue(
      buildSupabaseStub({ insertError: { code: '42501', message: 'permission denied' } }),
    )
    getProfileByIdMock.mockResolvedValue({ id: targetId })

    const result = await createReport({ targetType: 'user', targetId, reason: 'spam' })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('想定外のエラーコードは INTERNAL_ERROR を返す', async () => {
    createClientMock.mockResolvedValue(
      buildSupabaseStub({ insertError: { code: 'XXXXX', message: 'boom' } }),
    )
    getProfileByIdMock.mockResolvedValue({ id: targetId })

    const result = await createReport({ targetType: 'user', targetId, reason: 'spam' })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})
