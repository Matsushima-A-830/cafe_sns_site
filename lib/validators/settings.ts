import { z } from 'zod'

/**
 * S_SETTINGS の各トグル・セレクトは押した瞬間に1項目だけ更新する（フォーム全体の
 * 送信はしない）。誰の設定かは必ずセッションから引くのでここには載せない
 *   docs/design/wireframes/mypage.md #S_SETTINGS
 */
export const updateSettingsSchema = z
  .object({
    notifyLike: z.boolean().optional(),
    notifyComment: z.boolean().optional(),
    notifyFollow: z.boolean().optional(),
    useLocation: z.boolean().optional(),
    allowRecommendation: z.boolean().optional(),
    fontScale: z.enum(['small', 'normal', 'large']).optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: '更新する項目が指定されていません',
  })

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
