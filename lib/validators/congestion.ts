import { z } from 'zod'
import { CONGESTION_LEVELS } from '@/lib/cafes/congestion'

/**
 * 混雑度報告の入力。報告者（user_id）は必ずセッションから引くのでここには載せない
 * （他人になりすまして報告させないため）。level の範囲は
 * cafe_congestion_reports_level_check（1〜5）と対にする
 */
export const reportCongestionSchema = z.object({
  cafeId: z.string().uuid(),
  level: z.number().int().min(1).max(CONGESTION_LEVELS),
})

export type ReportCongestionInput = z.infer<typeof reportCongestionSchema>
