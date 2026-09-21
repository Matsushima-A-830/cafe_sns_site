import { z } from 'zod'

// S_PROFILE_EDIT。username は含めない（変更不可 — onboarding の usernameSchema 参照）。
// 未入力に戻す操作を許すため bio は空文字を許容し、Server Action 側で null に変換する
export const profileEditSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, '表示名を入力してください')
    .max(30, '表示名は30文字以内で入力してください'),
  bio: z.string().trim().max(160, '自己紹介は160文字以内で入力してください').optional(),
})

export type ProfileEditInput = z.infer<typeof profileEditSchema>
