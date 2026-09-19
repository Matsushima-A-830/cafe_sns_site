import { z } from 'zod'

/**
 * いいねの追加・解除の入力。誰のいいねかは必ずセッションから引くのでここには載せない
 * （他人のいいねを付け外しさせないため。cafeListEntrySchema と同じ方針）
 */
export const likeEntrySchema = z.object({
  postId: z.string().uuid(),
})

export type LikeEntryInput = z.infer<typeof likeEntrySchema>
