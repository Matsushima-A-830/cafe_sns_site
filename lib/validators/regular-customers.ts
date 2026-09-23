import { z } from 'zod'

/** S_OWNER_REGULARS 認定モーダル。メモは任意（ワイヤー準拠） */
export const awardRegularSchema = z.object({
  cafeId: z.string().uuid(),
  userId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
})
export type AwardRegularInput = z.infer<typeof awardRegularSchema>

/** S_OWNER_REGULARS 取消モーダル */
export const revokeRegularSchema = z.object({
  cafeId: z.string().uuid(),
  userId: z.string().uuid(),
})
export type RevokeRegularInput = z.infer<typeof revokeRegularSchema>

/** S_OWNER_REGULARS メモ編集（常連タブ内の[メモ編集]） */
export const updateRegularNoteSchema = z.object({
  cafeId: z.string().uuid(),
  userId: z.string().uuid(),
  note: z.string().trim().max(500),
})
export type UpdateRegularNoteInput = z.infer<typeof updateRegularNoteSchema>
