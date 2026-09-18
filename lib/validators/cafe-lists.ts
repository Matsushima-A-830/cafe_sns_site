import { z } from 'zod'
import { CAFE_LIST_TYPES } from '@/lib/constants/cafe-lists'

/**
 * 「お気に入り」「行きたい」の出し入れの入力。所有者（user_id）は必ずセッションから引くので
 * ここには載せない（他人のリストを書き換えさせないため）。list_type の値は
 * user_cafe_lists_list_type_check と対にする
 */
export const cafeListEntrySchema = z.object({
  cafeId: z.string().uuid(),
  listType: z.enum(CAFE_LIST_TYPES),
})

export type CafeListEntryInput = z.infer<typeof cafeListEntrySchema>
