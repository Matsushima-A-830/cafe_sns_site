'use server'

import { reportError } from '@/lib/monitoring/report-error'
import { getCafeAnalytics } from '@/lib/owner/analytics'
import { createClient } from '@/lib/supabase/server'
import { exportCafeAnalyticsCsvSchema } from '@/lib/validators/owner-analytics'
import type { Result } from '@/types/result'

/**
 * S_OWNER_ANALYTICS の「CSVでダウンロード」。ファイルダウンロードは Route Handlers
 * ではなく Server Action で文字列を返し、クライアント側で Blob 化してダウンロードする
 * （docs/architecture/routing.md の方針: Route Handlers は外部連携・Webhookのみ）
 */

type ExportAnalyticsCsvError = 'INVALID_INPUT' | 'NOT_FOUND' | 'INTERNAL_ERROR'

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function buildCsv(rows: string[][]): string {
  // Excel で開いたときの文字化け対策として BOM 付き UTF-8 にする
  return `﻿${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}`
}

export async function exportCafeAnalyticsCsv(
  input: unknown,
): Promise<Result<{ csv: string; filename: string }, ExportAnalyticsCsvError>> {
  const parsed = exportCafeAnalyticsCsvSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  try {
    const analytics = await getCafeAnalytics(supabase, parsed.data.cafeId, parsed.data.weeks)
    if (!analytics) return { ok: false, error: 'NOT_FOUND' }

    const rows: string[][] = [['週開始日(JST)', '投稿数', 'いいね', '保存']]
    for (const point of analytics.trend) {
      rows.push([
        point.weekStart.slice(0, 10),
        String(point.posts),
        String(point.likes),
        String(point.bookmarks),
      ])
    }

    const filename = `${analytics.cafe.name}_analytics_${new Date().toISOString().slice(0, 10)}.csv`
    return { ok: true, data: { csv: buildCsv(rows), filename } }
  } catch (error) {
    reportError('owner-analytics', 'CSVエクスポートに失敗', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}
