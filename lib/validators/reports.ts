import { z } from 'zod'

/**
 * 通報の入力。reporter_id はセッションから引くのでここには載せない
 *   docs/architecture/data-model/tables.md #reports
 */
export const createReportSchema = z.object({
  targetType: z.enum(['post', 'comment', 'user', 'cafe']),
  targetId: z.string().uuid(),
  reason: z.enum(['spam', 'harassment', 'minor_risk', 'copyright', 'privacy', 'other']),
  description: z.string().trim().max(1000).optional(),
})

export type CreateReportInput = z.infer<typeof createReportSchema>
