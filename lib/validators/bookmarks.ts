import { z } from 'zod'

/**
 * 保存の追加・解除の入力。誰の保存かは必ずセッションから引くのでここには載せない
 * （他人の保存を付け外しさせないため。likeEntrySchema と同じ方針）
 */
export const bookmarkEntrySchema = z.object({
  postId: z.string().uuid(),
})

export type BookmarkEntryInput = z.infer<typeof bookmarkEntrySchema>
