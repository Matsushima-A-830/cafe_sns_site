import { z } from 'zod'
import { AVATAR_BUCKET } from '@/lib/storage/avatars'
import { storagePathFromPublicUrl } from '@/lib/storage/public-url'

// S_PROFILE_EDIT。username は含めない（変更不可 — onboarding の usernameSchema 参照）。
// 未入力に戻す操作を許すため bio は空文字を許容し、Server Action 側で null に変換する
export const profileEditSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, '表示名を入力してください')
    .max(30, '表示名は30文字以内で入力してください'),
  bio: z.string().trim().max(160, '自己紹介は160文字以内で入力してください').optional(),
  // avatars バケットが発行した公開URLからのみ受け付ける（lib/profiles/onboarding.ts の
  // avatarUrl: z.string().url() と違い、任意のURLを書き込めると ProfileAvatar の
  // isStoragePublicUrl 判定で弾かれるだけで実害は無いが、ここでも同じ轍を踏まない）
  avatarUrl: z
    .string()
    .trim()
    .optional()
    .refine((url) => url === undefined || storagePathFromPublicUrl(AVATAR_BUCKET, url) !== null, {
      message: 'アバター画像のURLが正しくありません',
    }),
})

export type ProfileEditInput = z.infer<typeof profileEditSchema>
