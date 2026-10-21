import { z } from 'zod'

/**
 * S_ADMIN_REVIEW の判定入力。decision と reports.target_type の整合は
 * Server Action 側でチェックする（zod は形だけ見る）
 *   docs/architecture/data-model/tables.md #reports
 */
export const resolveReportSchema = z.object({
  reportId: z.string().uuid(),
  decision: z.enum(['hide_post', 'delete_comment', 'suspend_user', 'hide_cafe', 'reject']),
  resolutionNotes: z.string().trim().max(1000).optional(),
})

export type ResolveReportInput = z.infer<typeof resolveReportSchema>
