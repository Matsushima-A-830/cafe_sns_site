import { z } from 'zod'

/**
 * S_ADMIN_OWNER_REVIEW の判定入力。却下時は review_notes（却下理由）を必須にする
 * — S_OWNER_PENDING が却下理由を表示する設計のため、空だと申請者に何も伝わらない
 *   docs/design/wireframes/owner.md #s_owner_pending
 */
export const resolveOwnerVerificationSchema = z
  .object({
    verificationId: z.string().uuid(),
    decision: z.enum(['approve', 'reject']),
    reviewNotes: z.string().trim().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === 'reject' && !data.reviewNotes) {
      ctx.addIssue({ code: 'custom', path: ['reviewNotes'], message: '却下理由を入力してください' })
    }
  })

export type ResolveOwnerVerificationInput = z.infer<typeof resolveOwnerVerificationSchema>
