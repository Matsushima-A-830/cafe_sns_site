import { z } from 'zod'

/**
 * フォロー / フォロー解除の入力。フォロー元（follower_id）は必ずセッションから引くので
 * ここには載せない（他人に代わってフォローさせないため）
 */
export const followUserSchema = z.object({
  followeeId: z.string().uuid(),
})

export type FollowUserInput = z.infer<typeof followUserSchema>
