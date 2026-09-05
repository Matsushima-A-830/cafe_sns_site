import { z } from 'zod'

// あとから変更できない（S_ONBOARD_PROFILE の注記）。英数字とアンダースコアのみ
export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'ユーザーネームは3文字以上で入力してください')
  .max(20, 'ユーザーネームは20文字以内で入力してください')
  .regex(/^[a-zA-Z0-9_]+$/, 'ユーザーネームは半角英数字と_のみ使用できます')

export const profileSchema = z.object({
  username: usernameSchema,
  displayName: z
    .string()
    .trim()
    .min(1, '表示名を入力してください')
    .max(30, '表示名は30文字以内で入力してください'),
  bio: z.string().trim().max(160, '自己紹介は160文字以内で入力してください').optional(),
  avatarUrl: z.string().url().optional(),
})

export type ProfileInput = z.infer<typeof profileSchema>

// スキップ可（NULL 許容）。areas.code への FK なので自由テキストは持たない
export const areaSchema = z.object({
  areaCode: z.string().min(1).optional(),
})

export type AreaInput = z.infer<typeof areaSchema>

// occasion / mood のみ選択可、1〜5個（DB の enforce_user_interest_tags_rules と同じ上限をアプリ層でも担保）
export const interestsSchema = z.object({
  tagIds: z
    .array(z.string().uuid())
    .min(1, '1つ以上選んでください')
    .max(5, '選べるのは5つまでです'),
})

export type InterestsInput = z.infer<typeof interestsSchema>
