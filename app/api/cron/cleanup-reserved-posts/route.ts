import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { cleanupReservedPosts } from '@/lib/cron/cleanup-reserved-posts'
import { serverEnv } from '@/lib/env.server'
import { reportError } from '@/lib/monitoring/report-error'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Result } from '@/types/result'

/**
 * GitHub Actions の schedule からのみ呼ぶ想定（.github/workflows/cleanup-reserved-posts.yml）。
 * posts の DELETE RLS は本人のみのため service_role 前提で実装している
 *   docs/operations/deployment.md #定期実行ジョブ
 */
function isAuthorized(request: Request): boolean {
  const header = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${serverEnv.CRON_SECRET}`
  const headerBuf = Buffer.from(header)
  const expectedBuf = Buffer.from(expected)
  if (headerBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(headerBuf, expectedBuf)
}

/**
 * Result型は常に200 OKで返す規約（docs/architecture/error-catalog.md）。
 * 呼び出し元（GitHub Actions）は HTTPステータスではなく body の ok で成否判定する
 */
export async function POST(
  request: Request,
): Promise<NextResponse<Result<{ deletedPostCount: number; deletedImageCount: number }>>> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' })
  }

  const result = await cleanupReservedPosts(createAdminClient())

  if (!result.ok) {
    reportError('cron/cleanup-reserved-posts', '放置された予約投稿の削除に失敗', result.details)
  }

  return NextResponse.json(result)
}
