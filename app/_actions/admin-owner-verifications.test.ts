import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getOwnerVerificationDetail,
  listOwnerVerifications,
  resolveOwnerVerification,
} from './admin-owner-verifications'

const { createClientMock, createOwnerDocumentViewUrlMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createOwnerDocumentViewUrlMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/storage/owner-documents', () => ({
  createOwnerDocumentViewUrl: createOwnerDocumentViewUrlMock,
}))

const adminId = '11111111-1111-4111-8111-111111111111'
const applicantId = '22222222-2222-4222-8222-222222222222'
const verificationId = '33333333-3333-4333-8333-333333333333'
const cafeId = '44444444-4444-4444-8444-444444444444'

/** select().eq()... の末に await されるチェーンを模す（admin-reports.test.ts と同じ手法） */
function makeChain(terminalResult: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'neq', 'in', 'order', 'update', 'insert']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(terminalResult)
  Object.defineProperty(chain, 'then', {
    value: (resolve: (value: unknown) => void, reject?: (error: unknown) => void) =>
      Promise.resolve(terminalResult).then(resolve, reject),
  })
  return chain
}

type Options = {
  user?: { id: string } | null
  role?: string | null
  status?: string | null
  verificationsSelectList?: { data: unknown[] | null; error?: unknown }
  verificationsSelectDetail?: { data: unknown | null; error?: unknown }
  /** resolveOwnerVerification の条件付き UPDATE の結果。data:null は「他の admin が先に判定済み」を表す */
  verificationsUpdate?: { data: unknown | null; error?: unknown }
  cafesUpdate?: { error?: unknown }
  profilesUpdate?: { data?: unknown; error?: unknown }
  auditLogsInsert?: { error?: unknown }
  notificationsInsert?: { error?: unknown }
}

function mockClient(options: Options = {}) {
  const user = 'user' in options ? options.user : { id: adminId }
  const role = 'role' in options ? options.role : 'admin'
  const status = 'status' in options ? options.status : 'active'

  const profilesTable = {
    select: vi.fn(() => makeChain({ data: { role, status }, error: null })),
    update: vi.fn(() => makeChain(options.profilesUpdate ?? { error: null })),
  }
  const verificationsTable = {
    select: vi.fn(() => ({
      // listOwnerVerifications は select().eq().order() をそのまま await する
      eq: vi.fn(() => ({
        order: vi
          .fn()
          .mockResolvedValue(options.verificationsSelectList ?? { data: [], error: null }),
        maybeSingle: vi
          .fn()
          .mockResolvedValue(options.verificationsSelectDetail ?? { data: null, error: null }),
      })),
    })),
    update: vi.fn(() =>
      makeChain(options.verificationsUpdate ?? { data: { id: verificationId }, error: null }),
    ),
  }
  const cafesTable = { update: vi.fn(() => makeChain(options.cafesUpdate ?? { error: null })) }
  const auditLogsTable = {
    insert: vi.fn().mockResolvedValue(options.auditLogsInsert ?? { error: null }),
  }
  const notificationsTable = {
    insert: vi.fn().mockResolvedValue(options.notificationsInsert ?? { error: null }),
  }

  const tables: Record<string, unknown> = {
    profiles: profilesTable,
    cafe_owner_verifications: verificationsTable,
    cafes: cafesTable,
    audit_logs: auditLogsTable,
    notifications: notificationsTable,
  }

  createClientMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => tables[table]),
  })

  return {
    cafesUpdate: cafesTable.update,
    profilesUpdate: profilesTable.update,
    verificationsUpdate: verificationsTable.update,
    auditLogsInsert: auditLogsTable.insert,
    notificationsInsert: notificationsTable.insert,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('requireAdmin ガード（listOwnerVerifications 経由で検証）', () => {
  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    mockClient({ user: null })

    const result = await listOwnerVerifications('pending')

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('admin ロールでなければ FORBIDDEN を返す', async () => {
    mockClient({ role: 'general' })

    const result = await listOwnerVerifications('pending')

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('role=admin でも status が active でなければ FORBIDDEN を返す', async () => {
    mockClient({ role: 'admin', status: 'suspended' })

    const result = await listOwnerVerifications('pending')

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })
})

describe('listOwnerVerifications', () => {
  it('status で絞り込んだ一覧をカフェ名付きで返す', async () => {
    mockClient({
      verificationsSelectList: {
        data: [
          {
            id: verificationId,
            cafe_id: cafeId,
            status: 'pending',
            created_at: '2026-09-21T00:00:00Z',
            cafe: { name: '喫茶ふたば' },
          },
        ],
        error: null,
      },
    })

    const result = await listOwnerVerifications('pending')

    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: verificationId,
          cafeId,
          cafeName: '喫茶ふたば',
          status: 'pending',
          createdAt: '2026-09-21T00:00:00Z',
        },
      ],
    })
  })
})

describe('getOwnerVerificationDetail', () => {
  it('申請が存在しなければ NOT_FOUND を返す', async () => {
    mockClient({ verificationsSelectDetail: { data: null, error: null } })

    const result = await getOwnerVerificationDetail(verificationId)

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' })
  })

  it('書類ごとに署名付き閲覧URLを付けて詳細を返す', async () => {
    mockClient({
      verificationsSelectDetail: {
        data: {
          id: verificationId,
          cafe_id: cafeId,
          status: 'pending',
          document_urls: [{ type: 'business_license', path: 'u1/v1/a.jpg' }],
          contact_email: 'owner@example.com',
          applicant_note: null,
          review_notes: null,
          created_at: '2026-09-21T00:00:00Z',
          reviewed_at: null,
          cafe: { name: '喫茶ふたば' },
          applicant: { id: applicantId, username: 'owner1', display_name: 'オーナー太郎' },
        },
        error: null,
      },
    })
    createOwnerDocumentViewUrlMock.mockResolvedValue({
      ok: true,
      data: 'https://signed.example.com/a.jpg',
    })

    const result = await getOwnerVerificationDetail(verificationId)

    expect(result).toEqual({
      ok: true,
      data: {
        id: verificationId,
        cafeId,
        cafeName: '喫茶ふたば',
        status: 'pending',
        contactEmail: 'owner@example.com',
        applicantNote: null,
        reviewNotes: null,
        createdAt: '2026-09-21T00:00:00Z',
        reviewedAt: null,
        applicant: { id: applicantId, username: 'owner1', displayName: 'オーナー太郎' },
        documents: [{ type: 'business_license', viewUrl: 'https://signed.example.com/a.jpg' }],
      },
    })
  })

  it('署名付きURLの発行に失敗した書類は viewUrl:null にする（一覧表示自体は諦めない）', async () => {
    mockClient({
      verificationsSelectDetail: {
        data: {
          id: verificationId,
          cafe_id: cafeId,
          status: 'pending',
          document_urls: [{ type: 'business_license', path: 'u1/v1/a.jpg' }],
          contact_email: 'owner@example.com',
          applicant_note: null,
          review_notes: null,
          created_at: '2026-09-21T00:00:00Z',
          reviewed_at: null,
          cafe: { name: '喫茶ふたば' },
          applicant: { id: applicantId, username: 'owner1', display_name: 'オーナー太郎' },
        },
        error: null,
      },
    })
    createOwnerDocumentViewUrlMock.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })

    const result = await getOwnerVerificationDetail(verificationId)

    expect(result.ok && result.data.documents).toEqual([
      { type: 'business_license', viewUrl: null },
    ])
  })
})

describe('resolveOwnerVerification', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await resolveOwnerVerification({
      verificationId: 'not-a-uuid',
      decision: 'approve',
    })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('却下時に reviewNotes が無ければ INVALID_INPUT を返す', async () => {
    const result = await resolveOwnerVerification({ verificationId, decision: 'reject' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('対象の申請が無ければ NOT_FOUND を返す', async () => {
    mockClient({ verificationsSelectDetail: { data: null, error: null } })

    const result = await resolveOwnerVerification({ verificationId, decision: 'approve' })

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' })
  })

  it('申請者本人（admin兼務）は自分の申請を判定できない（FORBIDDEN）', async () => {
    const spies = mockClient({
      verificationsSelectDetail: {
        data: { id: verificationId, cafe_id: cafeId, user_id: adminId, status: 'pending' },
        error: null,
      },
    })

    const result = await resolveOwnerVerification({ verificationId, decision: 'approve' })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(spies.verificationsUpdate).not.toHaveBeenCalled()
  })

  it('条件付きUPDATEが0件（他のadminが同時に判定済み）なら VERIFICATION_ALREADY_RESOLVED を返す', async () => {
    const spies = mockClient({
      verificationsSelectDetail: {
        data: { id: verificationId, cafe_id: cafeId, user_id: applicantId, status: 'pending' },
        error: null,
      },
      verificationsUpdate: { data: null, error: null },
    })

    const result = await resolveOwnerVerification({ verificationId, decision: 'approve' })

    expect(result).toEqual({ ok: false, error: 'VERIFICATION_ALREADY_RESOLVED' })
    // 排他制御に負けた以上、副作用を実行してはいけない
    expect(spies.cafesUpdate).not.toHaveBeenCalled()
    expect(spies.profilesUpdate).not.toHaveBeenCalled()
    expect(spies.auditLogsInsert).not.toHaveBeenCalled()
  })

  it('approve: cafes.verified_owner_id と profiles.role を更新し、owner_verified を通知する', async () => {
    const spies = mockClient({
      verificationsSelectDetail: {
        data: { id: verificationId, cafe_id: cafeId, user_id: applicantId, status: 'pending' },
        error: null,
      },
    })

    const result = await resolveOwnerVerification({ verificationId, decision: 'approve' })

    expect(result).toEqual({ ok: true, data: { verificationId } })
    expect(spies.cafesUpdate).toHaveBeenCalledWith({ verified_owner_id: applicantId })
    expect(spies.profilesUpdate).toHaveBeenCalledWith({ role: 'owner' })
    expect(spies.auditLogsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'approve_owner_verification',
        target_type: 'cafe_owner_verification',
        target_id: verificationId,
      }),
    )
    expect(spies.notificationsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ recipient_id: applicantId, type: 'owner_verified' }),
    )
  })

  it('approve: 申請者が既に admin ロールなら profiles.role の上書きをスキップする（降格防止）', async () => {
    const spies = mockClient({
      verificationsSelectDetail: {
        data: { id: verificationId, cafe_id: cafeId, user_id: applicantId, status: 'pending' },
        error: null,
      },
      profilesUpdate: { data: null, error: null },
    })

    const result = await resolveOwnerVerification({ verificationId, decision: 'approve' })

    expect(result).toEqual({ ok: true, data: { verificationId } })
    expect(spies.profilesUpdate).toHaveBeenCalledWith({ role: 'owner' })
    const updateChain = spies.profilesUpdate.mock.results[0]?.value as {
      neq: ReturnType<typeof vi.fn>
    }
    expect(updateChain.neq).toHaveBeenCalledWith('role', 'admin')
  })

  it('reject: cafes/profiles を更新せず、owner_verification_rejected を通知する', async () => {
    const spies = mockClient({
      verificationsSelectDetail: {
        data: { id: verificationId, cafe_id: cafeId, user_id: applicantId, status: 'pending' },
        error: null,
      },
    })

    const result = await resolveOwnerVerification({
      verificationId,
      decision: 'reject',
      reviewNotes: '書類の氏名が一致しません',
    })

    expect(result).toEqual({ ok: true, data: { verificationId } })
    expect(spies.cafesUpdate).not.toHaveBeenCalled()
    expect(spies.profilesUpdate).not.toHaveBeenCalled()
    expect(spies.notificationsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_id: applicantId,
        type: 'owner_verification_rejected',
      }),
    )
  })
})
