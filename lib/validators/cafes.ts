import { z } from 'zod'

// 検索語は ilike のパターンに埋めるだけで、長さに意味は無い。
// 極端に長い入力でDBを無駄に叩かないための上限
export const searchCafesSchema = z.object({
  query: z.string().trim().max(50).optional(),
})

export const cafeIdSchema = z.object({
  cafeId: z.string().uuid('カフェIDの形式が正しくありません'),
})

export type SearchCafesInput = z.infer<typeof searchCafesSchema>
