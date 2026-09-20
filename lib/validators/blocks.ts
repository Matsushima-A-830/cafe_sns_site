import { z } from 'zod'

/**
 * ブロック / ブロック解除の入力。ブロックする側（blocker_id）は必ずセッションから引くので
 * ここには載せない（follows.ts と同じ方針）
 */
export const blockUserSchema = z.object({
  targetUserId: z.string().uuid(),
})

export type BlockUserInput = z.infer<typeof blockUserSchema>
