import { afterEach, describe, expect, it, vi } from 'vitest'
import { getReportDetail, listReports, resolveReport } from './admin-reports'

const { createClientMock, getReportTargetSummaryMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getReportTargetSummaryMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/admin/report-target', () => ({
  getReportTargetSummary: getReportTargetSummaryMock,
}))

const adminId = '11111111-1111-4111-8111-111111111111'
const reporterId = '22222222-2222-4222-8222-222222222222'
const reportId = '33333333-3333-4333-8333-333333333333'
const postId = '44444444-4444-4444-8444-444444444444'

/** select().eq()... の末に await されるチェーンを模す（comments.test.ts と同じ手法） */
function makeChain(terminalResult: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'update', 'insert']) {
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
  reportsSelectList?: { data: unknown[] | null; error?: unknown }
  reportsSelectDetail?: { data: unknown | null; error?: unknown }
  /** resolveReport の条件付き UPDATE の結果。data:null は「他の admin が先に判定済み」を表す */
  reportsUpdate?: { data: unknown | null; error?: unknown }
  postsUpdate?: { error?: unknown }
  commentsUpdate?: { error?: unknown }
  profilesUpdate?: { error?: unknown }
  cafesUpdate?: { error?: unknown }
  auditLogsInsert?: { error?: unknown }
  notificationsInsert?: { error?: unknown }
}

/** createClientMock にスタブを積み、テーブルごとの呼び出しを検証できる spies を返す */
function mockClient(options: Options = {}) {
  const user = 'user' in options ? options.user : { id: adminId }
  const role = 'role' in options ? options.role : 'admin'
  const status = 'status' in options ? options.status : 'active'

  const profilesTable = {
    select: vi.fn(() => makeChain({ data: { role, status }, error: null })),
    update: vi.fn(() => makeChain(options.profilesUpdate ?? { error: null })),
  }
  const reportsTable = {
    select: vi.fn(() => ({
      // listReports は select().eq().order() をそのまま await する
      eq: vi.fn(() => ({
        order: vi.fn().mockResolvedValue(options.reportsSelectList ?? { data: [], error: null }),
        maybeSingle: vi
          .fn()
          .mockResolvedValue(options.reportsSelectDetail ?? { data: null, error: null }),
      })),
    })),
    update: vi.fn(() =>
      makeChain(options.reportsUpdate ?? { data: { id: reportId }, error: null }),
    ),
  }
  const postsTable = { update: vi.fn(() => makeChain(options.postsUpdate ?? { error: null })) }
  const commentsTable = {
    update: vi.fn(() => makeChain(options.commentsUpdate ?? { error: null })),
  }
  const cafesTable = {
    update: vi.fn(() => makeChain(options.cafesUpdate ?? { error: null })),
  }
  const auditLogsTable = {
    insert: vi.fn().mockResolvedValue(options.auditLogsInsert ?? { error: null }),
  }
  const notificationsTable = {
    insert: vi.fn().mockResolvedValue(options.notificationsInsert ?? { error: null }),
  }

  const tables: Record<string, unknown> = {
    profiles: profilesTable,
    reports: reportsTable,
    posts: postsTable,
    comments: commentsTable,
    cafes: cafesTable,
    audit_logs: auditLogsTable,
    notifications: notificationsTable,
  }

  createClientMock.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => tables[table]),
  })

  return {
    postsUpdate: postsTable.update,
    commentsUpdate: commentsTable.update,
    cafesUpdate: cafesTable.update,
    reportsUpdate: reportsTable.update,
    auditLogsInsert: auditLogsTable.insert,
    notificationsInsert: notificationsTable.insert,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('requireAdmin ガード（listReports 経由で検証）', () => {
  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    mockClient({ user: null })

    const result = await listReports('pending')

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('admin ロールでなければ FORBIDDEN を返す', async () => {
    mockClient({ role: 'general' })

    const result = await listReports('pending')

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('role=admin でも status が active でなければ FORBIDDEN を返す（RLSのis_admin()と同じ条件に揃える）', async () => {
    mockClient({ role: 'admin', status: 'suspended' })

    const result = await listReports('pending')

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })
})

describe('listReports', () => {
  it('status で絞り込んだ一覧を返す', async () => {
    mockClient({
      reportsSelectList: {
        data: [
          {
            id: reportId,
            target_type: 'post',
            reason: 'spam',
            status: 'pending',
            created_at: '2026-09-21T00:00:00Z',
          },
        ],
        error: null,
      },
    })

    const result = await listReports('pending')

    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: reportId,
          targetType: 'post',
          reason: 'spam',
          status: 'pending',
          createdAt: '2026-09-21T00:00:00Z',
        },
      ],
    })
  })
})

describe('getReportDetail', () => {
  it('通報が存在しなければ NOT_FOUND を返す', async () => {
    mockClient({ reportsSelectDetail: { data: null, error: null } })

    const result = await getReportDetail(reportId)

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' })
  })

  it('通報詳細と対象サマリーを合わせて返す', async () => {
    mockClient({
      reportsSelectDetail: {
        data: {
          id: reportId,
          target_type: 'post',
          target_id: postId,
          reason: 'spam',
          description: null,
          status: 'pending',
          created_at: '2026-09-21T00:00:00Z',
          reporter: { id: reporterId, username: 'alice', display_name: 'アリス' },
        },
        error: null,
      },
    })
    getReportTargetSummaryMock.mockResolvedValue({ type: 'post', id: postId })

    const result = await getReportDetail(reportId)

    expect(result).toEqual({
      ok: true,
      data: {
        id: reportId,
        targetType: 'post',
        targetId: postId,
        reason: 'spam',
        description: null,
        status: 'pending',
        createdAt: '2026-09-21T00:00:00Z',
        reporter: { id: reporterId, username: 'alice', displayName: 'アリス' },
        target: { type: 'post', id: postId },
      },
    })
  })
})

describe('resolveReport', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await resolveReport({ reportId: 'not-a-uuid', decision: 'reject' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('対象の通報が無ければ NOT_FOUND を返す', async () => {
    mockClient({ reportsSelectDetail: { data: null, error: null } })

    const result = await resolveReport({ reportId, decision: 'reject' })

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' })
  })

  it('条件付きUPDATEが0件（他のadminが同時に判定済み）なら REPORT_ALREADY_RESOLVED を返す', async () => {
    const spies = mockClient({
      reportsSelectDetail: {
        data: {
          id: reportId,
          target_type: 'post',
          target_id: postId,
          reporter_id: reporterId,
          status: 'pending',
        },
        error: null,
      },
      // .eq('id',...).in('status', ['pending','reviewing']) が0件だったことを表す
      reportsUpdate: { data: null, error: null },
    })

    const result = await resolveReport({ reportId, decision: 'reject' })

    expect(result).toEqual({ ok: false, error: 'REPORT_ALREADY_RESOLVED' })
    // 排他制御に負けた以上、対象への副作用を実行してはいけない
    expect(spies.postsUpdate).not.toHaveBeenCalled()
    expect(spies.auditLogsInsert).not.toHaveBeenCalled()
  })

  it('decision と target_type が食い違う場合は INVALID_INPUT を返す', async () => {
    mockClient({
      reportsSelectDetail: {
        data: {
          id: reportId,
          target_type: 'comment',
          target_id: postId,
          reporter_id: reporterId,
          status: 'pending',
        },
        error: null,
      },
    })

    const result = await resolveReport({ reportId, decision: 'hide_post' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: undefined })
  })

  it('hide_post: 投稿を非表示にし、reports を resolved にする', async () => {
    const spies = mockClient({
      reportsSelectDetail: {
        data: {
          id: reportId,
          target_type: 'post',
          target_id: postId,
          reporter_id: reporterId,
          status: 'pending',
        },
        error: null,
      },
    })

    const result = await resolveReport({ reportId, decision: 'hide_post' })

    expect(result).toEqual({ ok: true, data: { reportId } })
    expect(spies.postsUpdate).toHaveBeenCalledWith({ status: 'hidden' })
    expect(spies.auditLogsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'hide_post', target_type: 'post', target_id: postId }),
    )
    expect(spies.notificationsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ recipient_id: reporterId, type: 'report_resolved' }),
    )
  })

  it('hide_cafe: カフェを非表示にし、reports を resolved にする', async () => {
    const spies = mockClient({
      reportsSelectDetail: {
        data: {
          id: reportId,
          target_type: 'cafe',
          target_id: postId,
          reporter_id: reporterId,
          status: 'pending',
        },
        error: null,
      },
    })

    const result = await resolveReport({ reportId, decision: 'hide_cafe' })

    expect(result).toEqual({ ok: true, data: { reportId } })
    expect(spies.cafesUpdate).toHaveBeenCalledWith({ status: 'hidden' })
    expect(spies.auditLogsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'hide_cafe', target_type: 'cafe', target_id: postId }),
    )
    expect(spies.notificationsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ recipient_id: reporterId, type: 'report_resolved' }),
    )
  })

  it('decision=hide_cafe だが target_type が cafe でなければ INVALID_INPUT を返す', async () => {
    const spies = mockClient({
      reportsSelectDetail: {
        data: {
          id: reportId,
          target_type: 'post',
          target_id: postId,
          reporter_id: reporterId,
          status: 'pending',
        },
        error: null,
      },
    })

    const result = await resolveReport({ reportId, decision: 'hide_cafe' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: undefined })
    expect(spies.cafesUpdate).not.toHaveBeenCalled()
  })

  it('reject: 対象への副作用なしで reports を rejected にする', async () => {
    const spies = mockClient({
      reportsSelectDetail: {
        data: {
          id: reportId,
          target_type: 'cafe',
          target_id: postId,
          reporter_id: reporterId,
          status: 'pending',
        },
        error: null,
      },
    })

    const result = await resolveReport({ reportId, decision: 'reject' })

    expect(result).toEqual({ ok: true, data: { reportId } })
    expect(spies.reportsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected' }),
    )
  })
})
